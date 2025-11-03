import * as Client from "tokenlaunch";
import { rpcUrl } from "./util";

export default new Client.Client({
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CAXEF6EPKTV6SX4QOO45DZIJBSXUN7G6HT5KVUVQDA6YZE772ZER6N4C",
  rpcUrl,
  allowHttp: true,
  publicKey: undefined,
});
