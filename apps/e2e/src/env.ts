/** The one origin the suite drives (see playwright.config.ts for why it is the
 *  worker at :8787 and not the Vite dev server at :5173). */
export const APP_PORT = 8787;
export const APP_URL = `http://localhost:${APP_PORT}`;
