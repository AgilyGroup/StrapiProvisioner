const glob = require("glob");
const axios = require("axios");
const qs = require('qs');

const baseUrl = process.env.EXTERNAL_API_URL;
const pwd = process.env.PWD;
let provisionning_email;
let provisionning_password;
let args;

const log = function () {
  if (args.verbose === '1') {
    console.log.apply(null, arguments);
  }
}

const login = async () => {
  try {
    const { data } = await axios.post(`${baseUrl}/admin/login`, {
      email: provisionning_email,
      password: provisionning_password,
    });
    axios.defaults.headers.common['authorization'] = `Bearer ${data.data.token}`;

  } catch(e) {
    console.log('login error', e);
  }
};

const importRecord = async (record, endpoint) => {
  const findEndpoint = record.__findEndpoint || endpoint;
  const createEndpoint = record.__createEndpoint || endpoint;
  const updateEndpoint = record.__updateEndpoint || endpoint;
  if (record.__upsertFilter) {
    const query = qs.stringify(record.__upsertFilter, { encodeValuesOnly: true });

    try {
      const findUrl = `${baseUrl}/${findEndpoint}?${query}`;
      log('find with :', findUrl);
      const find = await axios.get(findUrl);
      const findResults = record.__findPayloadKey ? find.data[record.__findPayloadKey] : find.data;
      log(findResults);
      if (findResults.length === 0) {
        const postUrl = `${baseUrl}/${createEndpoint}`;
        log('post to :', postUrl);
        const res = await axios.post(postUrl, record);
      } else {
        const putUrl = `${baseUrl}/${updateEndpoint}/${findResults[0].id}`;
        log('put to :', putUrl);
        const res = await axios.put(putUrl, record);
      }
    } catch (e) {
      console.log('req error ', e);
    }
  } else {
    const postUrl = `${baseUrl}/${createEndpoint}`;
    log('post to :', postUrl);
    const res = await axios.post(postUrl, record);
  }
}

const importFile = async (f) => {
  const fileContent = require(pwd + '/' + f);
  const endpoint = f.split('/')[1];
  console.log('Importing file ', f);
  if (Array.isArray(fileContent)) {
    for (let r of fileContent) {
      await importRecord(r, endpoint);
    }
  } else {
    await importRecord(fileContent, endpoint);
  }
  console.log('Import OK for file ', f);
}

const start = async () => {
  await login();
  glob('provisioner/**/*.json', (er, files) => {
    for(const f of files) {
      importFile(f);
    }
  });
  glob('provisioner/**/*.js', async (er, files) => {
    for(const f of files) {
      importFile(f);
    }
  });
}

//start();

module.exports = {
  start(email, password, _args) {
    args = _args;
    provisionning_email = email;
    provisionning_password = password;
    console.log('Starting provisioning');
    console.log('------------------------------------------');
    console.log('- with root folder : ', pwd);
    console.log('- with strapi URL : ', baseUrl);
    console.log('------------------------------------------');

    start();
  }
}