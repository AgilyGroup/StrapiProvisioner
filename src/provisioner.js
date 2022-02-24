const glob = require("glob");
const axios = require("axios");
const qs = require('qs');
const traverse = require('traverse');

const pwd = process.env.PWD;
let provisionning_email;
let provisionning_password;
let baseUrl;
let args;

const filesByEndpoint = {};

const log = function () {
  if (args.verbose === '1') {
    console.log.apply(null, arguments);
  }
}

const login = async () => {
  try {
    const { data } = await axios.post(`${provisionning_baseUrl}/admin/login`, {
      email: provisionning_email,
      password: provisionning_password,
    });
    axios.defaults.headers.common['authorization'] = `Bearer ${data.data.token}`;

  } catch(e) {
    console.log('login error', e);
  }
};

planifyImportRecord = async (record, endpoint) => {
  const afterEndpoint = record.__afterEndpoint;
  if (afterEndpoint) {
    if (filesByEndpoint[afterEndpoint].importDone) {
      await importRecord(record, endpoint);
    } else {
      filesByEndpoint[afterEndpoint].afterCallbacks.push(async () => {
        await importRecord(record, endpoint);
      });
    }
  } else {
    await importRecord(record, endpoint);
  }

};

const importRecord = async (record, endpoint) => {
  const findEndpoint = record.__findEndpoint || endpoint;
  const createEndpoint = record.__createEndpoint || endpoint;
  const updateEndpoint = record.__updateEndpoint || endpoint;
  const relationsToFind = {};
  record = traverse(record).map(function (value) {
    if (typeof value === 'object' && value !== null) {
      if(value.__find) {
        const query = qs.stringify(value.__find.filter, { encodeValuesOnly: true });
        const findUrl = `${provisionning_baseUrl}/${value.__find.endpoint}?${query}`;
        relationsToFind[findUrl] = 'find';
      }
      if(value.__findAll) {
        const query = qs.stringify(value.__find.filter, { encodeValuesOnly: true });
        const findUrl = `${provisionning_baseUrl}/${value.__find.endpoint}?${query}`;
        relationsToFind[findUrl] = 'findAll';
      }
      //const findResults = record.__findPayloadKey ? find.data[record.__findPayloadKey] : find.data;
    }
    return value;
  });
  for(let url in relationsToFind) {
    const operation = relationsToFind[url];
    relationsToFind[url] = await axios.get(url);
    relationsToFind[url] = relationsToFind[url].data;
    if (operation === 'find') {
      relationsToFind[url] = relationsToFind[url][0];
    }
  }
  record = traverse(record).map(function (value) {
    if (typeof value === 'object' && value !== null && value.__find) {
      const query = qs.stringify(value.__find.filter, { encodeValuesOnly: true });
      const findUrl = `${provisionning_baseUrl}/${value.__find.endpoint}?${query}`;
      return relationsToFind[findUrl].id;
    }
    return value;
  });
  log('importrecord', record);
  if (record.__upsertFilter) {
    const query = qs.stringify(record.__upsertFilter, { encodeValuesOnly: true });

    try {
      const findUrl = `${provisionning_baseUrl}/${findEndpoint}?${query}`;
      log('find with :', findUrl);
      const find = await axios.get(findUrl);
      const findResults = record.__findPayloadKey ? find.data[record.__findPayloadKey] : find.data;
      log(findResults);
      if (findResults.length === 0) {
        const postUrl = `${provisionning_baseUrl}/${createEndpoint}`;
        log('post to :', postUrl);
        const res = await axios.post(postUrl, record);
      } else {
        const putUrl = `${provisionning_baseUrl}/${updateEndpoint}/${findResults[0].id}`;
        log('put to :', putUrl);
        const res = await axios.put(putUrl, record);
      }
    } catch (e) {
      console.log('req error ', e);
    }
  } else {
    const postUrl = `${provisionning_baseUrl}/${createEndpoint}`;
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
      await planifyImportRecord(r, endpoint);
    }
  } else {
    await planifyImportRecord(fileContent, endpoint);
  }
  console.log('Import OK for file ', f);
}

const start = async () => {
  await login();
  glob('provisioner/**/*.json', (er, files) => {
    for(const f of files) {
      const endpoint = f.split('/')[1];
      if (filesByEndpoint[endpoint] === undefined) {
        filesByEndpoint[endpoint] = { files: [], afterCallbacks: [] };
      }
      filesByEndpoint[endpoint].files.push(f);
    }
  });
  glob('provisioner/**/*.js', async (er, files) => {
    for(const f of files) {
      const endpoint = f.split('/')[1];
      if (filesByEndpoint[endpoint] === undefined) {
        filesByEndpoint[endpoint] = { files: [], afterCallbacks: [] };
      }
      filesByEndpoint[endpoint].files.push(f);
    }
  });
  setTimeout(async () => {
    for(let endpoint in filesByEndpoint) {
      for (let f of filesByEndpoint[endpoint].files) {
        await importFile(f);
      }
      filesByEndpoint[endpoint].importDone = true;
      for (let cb of filesByEndpoint[endpoint].afterCallbacks) {
        cb();
      }
    }
  }, 1000);
}

//start();

module.exports = {
  start(email, password, baseUrl, _args) {
    args = _args;
    provisionning_email = email;
    provisionning_password = password;
    provisionning_baseUrl = baseUrl;
    console.log('Starting provisioning');
    console.log('------------------------------------------');
    console.log('- with root folder : ', pwd);
    console.log('- with strapi URL : ', baseUrl);
    console.log('------------------------------------------');

    start();
  }
}