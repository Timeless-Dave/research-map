/** Explicit request lifecycle, so an empty result is distinguishable from a
 *  failure and from work still in flight. */
export type FetchStatus = "loading" | "success" | "error";
