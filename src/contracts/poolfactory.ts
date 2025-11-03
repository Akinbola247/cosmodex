import * as Client from "poolfactory";
import { rpcUrl } from "./util";

export default new Client.Client({
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CCA6WZEXVK2AFI2BIG5PSJODNL2U6727KHISBDGEXV2FTGPW4DPGNZH3",
  rpcUrl,
  allowHttp: true,
  publicKey: undefined,
});
