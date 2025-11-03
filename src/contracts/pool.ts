import * as Client from "pool";
import { rpcUrl } from "./util";

export default new Client.Client({
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CDLPZ7IUJ7DRU3P3FQEDYSYAG6DSD77QJT4ENHZTRPB26ABTUSEVXVHP",
  rpcUrl,
  allowHttp: true,
  publicKey: undefined,
});
