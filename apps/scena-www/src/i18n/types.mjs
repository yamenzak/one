// @ts-check
/**
 * Shared shape for every locale catalog. Kept deliberately shallow past the top
 * level: the point is to catch a locale that forgets a whole section, not to
 * re-declare every leaf string. `en.mjs` is the reference implementation.
 *
 * @typedef {Object} Messages
 * @property {string} htmlLang
 * @property {{title:string,description:string,ogAlt:string,keywords:string}} meta
 * @property {Record<string,string>} nav
 * @property {Record<string,string>} hero
 * @property {Object} frame
 * @property {Object} devices
 * @property {Object} channel
 * @property {Object} board
 * @property {Object} trust
 * @property {Record<string,string>} featuresHead
 * @property {Object} fChannels
 * @property {Object} fAi
 * @property {Object} widgets
 * @property {Object} boards
 * @property {Object} how
 * @property {Object} pricing
 * @property {{eyebrow:string,h2:string,items:{q:string,a:string}[]}} faq
 * @property {Record<string,string>} cta
 * @property {Record<string,string>} notFound
 * @property {Object} footer
 */
export {};
