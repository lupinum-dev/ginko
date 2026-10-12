// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useGinkoAssets } from '../src/assets.ts'

describe('useGinkoAssets', () => {
  it('names the missing adapter when no parent provides one', () => {
    const Probe = defineComponent({ setup() { useGinkoAssets(); return () => null } })
    expect(() => mount(Probe)).toThrow('[ginko-editor] provideGinkoAssets(...) fehlt: Bild- und Dateifelder brauchen einen Upload-Adapter.')
  })
})
