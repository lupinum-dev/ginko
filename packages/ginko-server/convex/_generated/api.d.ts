/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as agent from "../agent.js";
import type * as auth from "../auth.js";
import type * as backup from "../backup.js";
import type * as bundle from "../bundle.js";
import type * as changes from "../changes.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as entries from "../entries.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as image from "../image.js";
import type * as images from "../images.js";
import type * as invites from "../invites.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_agentTools from "../lib/agentTools.js";
import type * as lib_content from "../lib/content.js";
import type * as lib_corpus from "../lib/corpus.js";
import type * as lib_diff from "../lib/diff.js";
import type * as lib_fail from "../lib/fail.js";
import type * as lib_files from "../lib/files.js";
import type * as lib_history from "../lib/history.js";
import type * as lib_i18n from "../lib/i18n.js";
import type * as lib_input from "../lib/input.js";
import type * as lib_library from "../lib/library.js";
import type * as lib_lifecycle from "../lib/lifecycle.js";
import type * as lib_list from "../lib/list.js";
import type * as lib_names from "../lib/names.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_publicness from "../lib/publicness.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_siteUrl from "../lib/siteUrl.js";
import type * as lib_translation from "../lib/translation.js";
import type * as lib_trees from "../lib/trees.js";
import type * as lib_write from "../lib/write.js";
import type * as mail from "../mail.js";
import type * as members from "../members.js";
import type * as migrations from "../migrations.js";
import type * as proposals from "../proposals.js";
import type * as refresh from "../refresh.js";
import type * as release from "../release.js";
import type * as reminders from "../reminders.js";
import type * as retention from "../retention.js";
import type * as routes_bundle from "../routes/bundle.js";
import type * as routes_export from "../routes/export.js";
import type * as routes_key from "../routes/key.js";
import type * as routes_mcp from "../routes/mcp.js";
import type * as routes_release from "../routes/release.js";
import type * as routes_upload from "../routes/upload.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as siteDeletion from "../siteDeletion.js";
import type * as sites from "../sites.js";
import type * as tasks from "../tasks.js";
import type * as uploads from "../uploads.js";
import type * as uploadsNode from "../uploadsNode.js";
import type * as views from "../views.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  agent: typeof agent;
  auth: typeof auth;
  backup: typeof backup;
  bundle: typeof bundle;
  changes: typeof changes;
  cleanup: typeof cleanup;
  crons: typeof crons;
  demo: typeof demo;
  entries: typeof entries;
  files: typeof files;
  http: typeof http;
  image: typeof image;
  images: typeof images;
  invites: typeof invites;
  "lib/access": typeof lib_access;
  "lib/agentTools": typeof lib_agentTools;
  "lib/content": typeof lib_content;
  "lib/corpus": typeof lib_corpus;
  "lib/diff": typeof lib_diff;
  "lib/fail": typeof lib_fail;
  "lib/files": typeof lib_files;
  "lib/history": typeof lib_history;
  "lib/i18n": typeof lib_i18n;
  "lib/input": typeof lib_input;
  "lib/library": typeof lib_library;
  "lib/lifecycle": typeof lib_lifecycle;
  "lib/list": typeof lib_list;
  "lib/names": typeof lib_names;
  "lib/policy": typeof lib_policy;
  "lib/publicness": typeof lib_publicness;
  "lib/search": typeof lib_search;
  "lib/siteUrl": typeof lib_siteUrl;
  "lib/translation": typeof lib_translation;
  "lib/trees": typeof lib_trees;
  "lib/write": typeof lib_write;
  mail: typeof mail;
  members: typeof members;
  migrations: typeof migrations;
  proposals: typeof proposals;
  refresh: typeof refresh;
  release: typeof release;
  reminders: typeof reminders;
  retention: typeof retention;
  "routes/bundle": typeof routes_bundle;
  "routes/export": typeof routes_export;
  "routes/key": typeof routes_key;
  "routes/mcp": typeof routes_mcp;
  "routes/release": typeof routes_release;
  "routes/upload": typeof routes_upload;
  search: typeof search;
  seed: typeof seed;
  siteDeletion: typeof siteDeletion;
  sites: typeof sites;
  tasks: typeof tasks;
  uploads: typeof uploads;
  uploadsNode: typeof uploadsNode;
  views: typeof views;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
