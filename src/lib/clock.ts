/** Server components cannot call Date.now() in render, so the clock lives here. */
export const now = () => Date.now();
