import type Iridium from '../../iridium';
import { IridiumDocument } from '../../types';

/**
 * Resolve links in a document and load the linked fragments
 * @param doc
 * @param options
 * @returns IridiumDocument
 */
export async function resolveDocumentLinks(
  doc: IridiumDocument,
  iridium: Iridium,
  options: { depth?: number }
) {
  if (options.depth && doc._links) {
    let depth = options.depth - 1;
    await Promise.all(
      Object.keys(doc._links).map(async (key) => {
        const cid = doc._links[key];
        try {
          const child = await iridium.load(cid, { depth, ...options });
          doc[key] = child;
        } catch (e) {
          console.warn(`failed to load linked data: ${cid}`);
        }
      })
    );
    delete doc._links;
  }
  return doc;
}
