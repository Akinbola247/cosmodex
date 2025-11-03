import * as Client from "tokenfactory";
import { rpcUrl } from "./util";

export default new Client.Client({
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CAZ7KEXHZDHP6ZZXOADXNBN4XY3TPRVWJSHU3UDXIN3GKJALJDAR2S6Y",
  rpcUrl,
  allowHttp: true,
  publicKey: undefined,
});
