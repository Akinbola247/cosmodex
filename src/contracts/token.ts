import * as Client from "token";
import { rpcUrl } from "./util";

export default new Client.Client({
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CDHIKAGJD6MIGXGPCY26ZLHV44JOKK6YU2JPNEZO3TNSXR4IOPPL7CRY",
  rpcUrl,
  allowHttp: true,
  publicKey: undefined,
});
