import type { ResolverRegistry } from 'did-resolver';
import KeyDIDResolver from 'key-did-resolver';
const resolver: ResolverRegistry = KeyDIDResolver.getResolver();
export default resolver;
