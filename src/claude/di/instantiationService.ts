/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  DisposableStore, dispose, IDisposable, isDisposable, illegalState,
} from './base';
import { SyncDescriptor } from './descriptors';
import { GetLeadingNonServiceArgs, IInstantiationService, ServiceIdentifier, ServicesAccessor, _util } from './instantiation';
import { ServiceCollection } from './serviceCollection';

// ── Graph (internal — used for dependency resolution and cycle detection) ──

class GraphNode<T> {
  readonly incoming = new Map<string, GraphNode<T>>();
  readonly outgoing = new Map<string, GraphNode<T>>();
  constructor(readonly key: string, readonly data: T) {}
}

class Graph<T> {
  private readonly _nodes = new Map<string, GraphNode<T>>();

  constructor(private readonly _hashFn: (element: T) => string) {}

  roots(): GraphNode<T>[] {
    const ret: GraphNode<T>[] = [];
    for (const node of this._nodes.values()) {
      if (node.outgoing.size === 0) ret.push(node);
    }
    return ret;
  }

  insertEdge(from: T, to: T): void {
    const fromNode = this.lookupOrInsertNode(from);
    const toNode = this.lookupOrInsertNode(to);
    fromNode.outgoing.set(toNode.key, toNode);
    toNode.incoming.set(fromNode.key, fromNode);
  }

  removeNode(data: T): void {
    const key = this._hashFn(data);
    this._nodes.delete(key);
    for (const node of this._nodes.values()) {
      node.outgoing.delete(key);
      node.incoming.delete(key);
    }
  }

  lookupOrInsertNode(data: T): GraphNode<T> {
    const key = this._hashFn(data);
    let node = this._nodes.get(key);
    if (!node) {
      node = new GraphNode(key, data);
      this._nodes.set(key, node);
    }
    return node;
  }

  isEmpty(): boolean {
    return this._nodes.size === 0;
  }

  findCycleSlow(): string | undefined {
    for (const [id, node] of this._nodes) {
      const seen = new Set<string>([id]);
      const res = this._findCycle(node, seen);
      if (res) return res;
    }
    return undefined;
  }

  private _findCycle(node: GraphNode<T>, seen: Set<string>): string | undefined {
    for (const [id, outgoing] of node.outgoing) {
      if (seen.has(id)) return [...seen, id].join(' -> ');
      seen.add(id);
      const value = this._findCycle(outgoing, seen);
      if (value) return value;
      seen.delete(id);
    }
    return undefined;
  }
}

// ── InstantiationService ──

class CyclicDependencyError extends Error {
  constructor(graph: Graph<any>) {
    super('cyclic dependency between services');
    this.message = graph.findCycleSlow() ?? `UNABLE to detect cycle, dumping graph: \n${graph.toString()}`;
  }
}

export class InstantiationService implements IInstantiationService {

  declare readonly _serviceBrand: undefined;

  private _isDisposed = false;
  private readonly _servicesToMaybeDispose = new Set<any>();
  private readonly _children = new Set<InstantiationService>();

  constructor(
    private readonly _services: ServiceCollection = new ServiceCollection(),
    private readonly _strict: boolean = false,
    private readonly _parent?: InstantiationService,
  ) {
    this._services.set(IInstantiationService, this);
  }

  dispose(): void {
    if (!this._isDisposed) {
      this._isDisposed = true;
      dispose(this._children);
      this._children.clear();

      for (const candidate of this._servicesToMaybeDispose) {
        if (isDisposable(candidate)) {
          candidate.dispose();
        }
      }
      this._servicesToMaybeDispose.clear();
    }
  }

  private _throwIfDisposed(): void {
    if (this._isDisposed) {
      throw new Error('InstantiationService has been disposed');
    }
  }

  createChild(services: ServiceCollection, store?: DisposableStore): IInstantiationService {
    this._throwIfDisposed();

    const that = this;
    const result = new class extends InstantiationService {
      override dispose(): void {
        that._children.delete(result);
        super.dispose();
      }
    }(services, this._strict, this);
    this._children.add(result);

    store?.add(result);
    return result;
  }

  invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
    this._throwIfDisposed();

    let _done = false;
    try {
      const accessor: ServicesAccessor = {
        get: <T>(id: ServiceIdentifier<T>) => {
          if (_done) {
            throw illegalState('service accessor is only valid during the invocation of its target method');
          }
          const result = this._getOrCreateServiceInstance(id);
          if (!result) {
            throw new Error(`[invokeFunction] unknown service '${id}'`);
          }
          return result;
        },
      };
      return fn(accessor, ...args);
    } finally {
      _done = true;
    }
  }

  createInstance<T>(descriptor: SyncDescriptor<T>): T;
  createInstance<Ctor extends new (...args: any[]) => unknown, R extends InstanceType<Ctor>>(ctor: Ctor, ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>): R;
  createInstance(ctorOrDescriptor: any | SyncDescriptor<any>, ...rest: unknown[]): unknown {
    this._throwIfDisposed();

    if (ctorOrDescriptor instanceof SyncDescriptor) {
      return this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest));
    } else {
      return this._createInstance(ctorOrDescriptor, rest);
    }
  }

  private _createInstance<T>(ctor: any, args: unknown[] = []): T {
    const serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
    const serviceArgs: unknown[] = [];
    for (const dependency of serviceDependencies) {
      const service = this._getOrCreateServiceInstance(dependency.id);
      if (!service) {
        this._throwIfStrict(`[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`, false);
      }
      serviceArgs.push(service);
    }

    const firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;

    if (args.length !== firstServiceArgPos) {
      console.trace(`[createInstance] First service dependency of ${ctor.name} at position ${firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);
      const delta = firstServiceArgPos - args.length;
      if (delta > 0) {
        args = args.concat(new Array(delta));
      } else {
        args = args.slice(0, firstServiceArgPos);
      }
    }

    return Reflect.construct<any, T>(ctor, args.concat(serviceArgs));
  }

  private _setCreatedServiceInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
    if (this._services.get(id) instanceof SyncDescriptor) {
      this._services.set(id, instance);
    } else if (this._parent) {
      this._parent._setCreatedServiceInstance(id, instance);
    } else {
      throw new Error('illegalState - setting UNKNOWN service instance');
    }
  }

  private _getServiceInstanceOrDescriptor<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
    const instanceOrDesc = this._services.get(id);
    if (!instanceOrDesc && this._parent) {
      return this._parent._getServiceInstanceOrDescriptor(id);
    } else {
      return instanceOrDesc;
    }
  }

  private _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>): T {
    const thing = this._getServiceInstanceOrDescriptor(id);
    if (thing instanceof SyncDescriptor) {
      return this._safeCreateAndCacheServiceInstance(id, thing);
    } else {
      return thing;
    }
  }

  private readonly _activeInstantiations = new Set<ServiceIdentifier<any>>();

  private _safeCreateAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>): T {
    if (this._activeInstantiations.has(id)) {
      throw new Error(`illegal state - RECURSIVELY instantiating service '${id}'`);
    }
    this._activeInstantiations.add(id);
    try {
      return this._createAndCacheServiceInstance(id, desc);
    } finally {
      this._activeInstantiations.delete(id);
    }
  }

  private _createAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>): T {

    type Triple = { id: ServiceIdentifier<any>; desc: SyncDescriptor<any> };
    const graph = new Graph<Triple>(data => data.id.toString());

    let cycleCount = 0;
    const stack = [{ id, desc }];
    const seen = new Set<string>();
    while (stack.length) {
      const item = stack.pop()!;

      if (seen.has(String(item.id))) continue;
      seen.add(String(item.id));

      graph.lookupOrInsertNode(item);

      if (cycleCount++ > 1000) {
        throw new CyclicDependencyError(graph);
      }

      for (const dependency of _util.getServiceDependencies(item.desc.ctor)) {
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
        if (!instanceOrDesc) {
          this._throwIfStrict(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`, true);
        }

        if (instanceOrDesc instanceof SyncDescriptor) {
          const d = { id: dependency.id, desc: instanceOrDesc };
          graph.insertEdge(item, d);
          stack.push(d);
        }
      }
    }

    while (true) {
      const roots = graph.roots();

      if (roots.length === 0) {
        if (!graph.isEmpty()) {
          throw new CyclicDependencyError(graph);
        }
        break;
      }

      for (const { data } of roots) {
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(data.id);
        if (instanceOrDesc instanceof SyncDescriptor) {
          const instance = this._createServiceInstanceWithOwner(data.id, data.desc.ctor, data.desc.staticArguments);
          this._setCreatedServiceInstance(data.id, instance);
        }
        graph.removeNode(data);
      }
    }
    return <T>this._getServiceInstanceOrDescriptor(id);
  }

  private _createServiceInstanceWithOwner<T>(id: ServiceIdentifier<T>, ctor: any, args: unknown[] = []): T {
    if (this._services.get(id) instanceof SyncDescriptor) {
      return this._createServiceInstance(id, ctor, args);
    } else if (this._parent) {
      return this._parent._createServiceInstanceWithOwner(id, ctor, args);
    } else {
      throw new Error(`illegalState - creating UNKNOWN service instance ${ctor.name}`);
    }
  }

  private _createServiceInstance<T>(id: ServiceIdentifier<T>, ctor: any, args: unknown[] = []): T {
    const result = this._createInstance<T>(ctor, args);
    this._servicesToMaybeDispose.add(result);
    return result;
  }

  private _throwIfStrict(msg: string, printWarning: boolean): void {
    if (printWarning) {
      console.warn(msg);
    }
    if (this._strict) {
      throw new Error(msg);
    }
  }
}
