<template>
  <!-- omp's block-character mark, as its CLI prints it: one 9×20 cell per terminal column (transparent, gradient kept) -->
  <svg class="omp-mark" viewBox="0 0 108 100" aria-hidden="true">
        <rect x="0" y="0" width="9" height="20" fill="#f84fcc" />
        <rect x="9" y="0" width="9" height="20" fill="#ef51d0" />
        <rect x="18" y="0" width="9" height="20" fill="#e652d3" />
        <rect x="27" y="0" width="9" height="20" fill="#dc54d7" />
        <rect x="36" y="0" width="9" height="20" fill="#d356db" />
        <rect x="45" y="0" width="9" height="20" fill="#ca58de" />
        <rect x="54" y="0" width="9" height="20" fill="#c159e2" />
        <rect x="63" y="0" width="9" height="20" fill="#b85be5" />
        <rect x="72" y="0" width="9" height="20" fill="#af5de9" />
        <rect x="81" y="0" width="9" height="20" fill="#a55fed" />
        <rect x="90" y="0" width="9" height="20" fill="#9c60f0" />
        <rect x="99" y="0" width="9" height="20" fill="#9362f4" />
        <rect x="27" y="20" width="9" height="20" fill="#c359e1" />
        <rect x="36" y="20" width="9" height="20" fill="#ba5be5" />
        <rect x="63" y="20" width="9" height="20" fill="#9e60ef" />
        <rect x="72" y="20" width="9" height="20" fill="#9562f3" />
        <rect x="27" y="40" width="9" height="20" fill="#aa5eeb" />
        <rect x="36" y="40" width="9" height="20" fill="#a15fef" />
        <rect x="63" y="40" width="9" height="20" fill="#7f72f2" />
        <rect x="72" y="40" width="9" height="20" fill="#727ef0" />
        <rect x="27" y="60" width="9" height="20" fill="#aa5eeb" opacity="0.4" />
        <rect x="36" y="60" width="9" height="20" fill="#a15fef" opacity="0.4" />
        <rect x="63" y="60" width="9" height="20" fill="#5a91ee" />
        <rect x="72" y="60" width="9" height="20" fill="#4d9cec" />
        <rect x="63" y="80" width="9" height="20" fill="#35afea" />
        <rect x="72" y="80" width="9" height="20" fill="#28bae8" />
  </svg>
</template>

<style scoped>
.omp-mark {
  display: block;
  flex: 0 0 auto;
  shape-rendering: crispEdges;
}
</style>
