import { DecryptJWEOptions, DID } from 'dids';
import * as json from 'multiformats/codecs/json';
import { sha256 as _sha256 } from 'multiformats/hashes/sha2';
import { base64 } from 'multiformats/bases/base64';
import { verifySigned } from '../core/identity/did/utils';
import Iridium from '../iridium';
import { IridiumDocument, IridiumPayload, IridiumWriteOptions } from '../types';
import { CID } from 'multiformats';

export type IridiumDecodedPayload<T = IridiumDocument> = {
  encoding: 'jwe' | 'jws' | 'json' | 'raw';
  body: T;
};

export function sha256(data: any) {
  const encoded = json.encode(data);
  return _sha256.encode(encoded);
}

export async function hash(data: any): Promise<string> {
  return base64.encode(await _sha256.encode(json.encode(data)));
}

export async function decodePayload<
  Doc extends IridiumDocument = IridiumDocument
>(
  payload: IridiumPayload,
  did?: DID,
  options?: { decrypt?: DecryptJWEOptions }
): Promise<IridiumDecodedPayload<Doc | string | Uint8Array> | false> {
  if (payload.encoding === 'raw') {
    return { encoding: 'raw', body: payload.body as Uint8Array };
  }

  if (payload.encoding === 'json') {
    return {
      encoding: 'json',
      body: json.decode<Doc>(payload.body as Uint8Array),
    };
  }

  if (payload.encoding === 'jwe') {
    if (!did)
      throw new Error('decodePayload: cannot decrypt jwe, no did provided');
    const encoded = await did.decryptJWE(payload.body, options?.decrypt);
    return { encoding: 'jwe', body: json.decode<Doc>(encoded) };
  }

  if (payload.encoding === 'jws') {
    if (!did) {
      throw new Error(
        'decodePayload: cannot verify signature, no did provided'
      );
    }
    const verified = await verifySigned<Doc>(payload.body, did);
    if (!verified) {
      throw new Error(
        'decodePayload: signature verification failed, payload is invalid'
      );
    }
    return { encoding: 'jws', body: verified };
  }

  throw new Error(
    `decodePayload: unsupported encoding format: ${
      (payload as any).encoding || '(unknown)'
    }`
  );
}

export async function encodePayload(
  payload: IridiumDocument | string,
  did: DID,
  options: IridiumWriteOptions & { link?: boolean; iridium?: Iridium } = {}
) {
  if (options.encrypt) {
    return json.encode({
      type: 'jwe',
      body: await did.createJWE(
        json.encode(payload),
        options.encrypt.recipients || [did.id],
        options.encrypt.options
      ),
    });
  } else if (options.sign) {
    return json.encode({
      type: 'jws',
      body: await did.createJWS(
        payload,
        options.sign === true ? undefined : options.sign
      ),
    });
  }
  const encoded = json.encode({ type: 'text', body: payload });

  if (options.link && options.iridium) {
    const cid = await options.iridium.store(encoded, options);
    return json.encode({ type: 'dag', body: cid });
  }

  return encoded;
}

export async function toCID(payload: any) {
  const bytes = json.encode(payload);
  const hash = await _sha256.digest(bytes);
  const cid = CID.create(1, json.code, hash);
  return cid;
}
