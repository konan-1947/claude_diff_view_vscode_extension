# Preview sample

Relative image: ![dot](./sample.png)

| Name | Qty |
| ---- | --- |
| a    | 1   |
| b    | 2   |

- [x] task list
- [ ] open item

```mermaid
graph TD;
  A[Start] --> B{Ok?};
  B -- yes --> C[Done];
  B -- no --> A;
```

<script>document.title = 'XSS'</script>
<img src=x onerror="document.title='XSS'">
[bad](javascript:alert(1)) and [anchor](#preview-sample)
