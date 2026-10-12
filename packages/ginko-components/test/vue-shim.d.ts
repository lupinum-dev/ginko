// Vue single-file components are loaded by Vite in the tests; tsc only needs to know their shape.
declare module '*.vue' {
  import type { Component } from 'vue'
  const component: Component
  export default component
}
