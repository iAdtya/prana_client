import { UnstructuredClient } from "unstructured-client";
import { Strategy } from "unstructured-client/sdk/models/shared/index.js";
import * as fs from "fs";

const unstructuredClient = new UnstructuredClient({
  security: {
    apiKeyAuth: "wTxT2zckazTCIfDhL3fS05CUMQphRH",
  },
});

const filename = "./uploads/Aditya-Resume.pdf";
const data = fs.readFileSync(filename);

unstructuredClient.general
  .partition({
    partitionParameters: {
      files: {
        content: data,
        fileName: filename,
      },
      strategy: Strategy.Auto,
    },
  })
  .then((res) => {
    if (res.statusCode == 200) {
      console.log(res.elements);
    }
  })
  .catch((e) => {
    console.log(e.statusCode);
    console.log(e.body);
  });
