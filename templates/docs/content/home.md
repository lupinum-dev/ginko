---
title: Orbit SDK, the TypeScript client for the Orbit API
description: Create monitors, read incidents and verify webhooks from Node.js, with types for every request and answer. Orbit SDK retries failed requests for you and pages through long lists.
install: npm install @orbit-example/sdk
links:
  - label: Get started
    href: $docs.getting-started
  - label: API reference
    href: $docs.client
features:
  - icon: lucide:key-round
    title: Authentication
    description: Create an API key and keep it on the server.
    href: $docs.authentication
  - icon: lucide:list-ordered
    title: Pagination
    description: Read one page, or every entry with for await.
    href: $docs.pagination
  - icon: lucide:refresh-cw
    title: Errors and retries
    description: Which errors the client retries, and which ones your code handles.
    href: $docs.errors-and-retries
  - icon: lucide:webhook
    title: Webhooks
    description: Get a request when a monitor goes down, and check that Orbit sent it.
    href: $docs.webhooks
  - icon: lucide:book-open
    title: API reference
    description: The client, every method with its parameters and return type, and the error codes.
    href: $docs.client
  - icon: lucide:history
    title: Changelog
    description: What changed in each version, newest first.
    href: $page.changelog
---

## Your first request

Orbit checks your websites every minute and opens an incident when one stops answering. With an API key from the Orbit dashboard, this script creates a monitor for a checkout page:

```ts [check-shop.ts]
import { Orbit } from '@orbit-example/sdk'

const orbit = new Orbit({ apiKey: process.env.ORBIT_API_KEY })

const monitor = await orbit.monitors.create({
  name: 'Shop checkout',
  url: 'https://shop.example.com/checkout',
})

console.log(monitor.id, monitor.status) // mon_8f2k1x pending
```

[Getting started]($docs.getting-started) explains each line. Orbit SDK runs on Node.js 22 or newer and in any runtime with `fetch`.
