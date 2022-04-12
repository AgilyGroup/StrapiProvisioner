const glob = require("glob");
const axios = require("axios");
const qs = require('qs');
const traverse = require('traverse');
const chalk = require('chalk');

const pwd = process.env.PWD;
let provisionning_email;
let provisionning_password;
let baseUrl;
let args;
let config = {};

let stats = {
  recordErrors: 0,
  recordTotal: 0,
  relationErrors: 0,
};

/**
 * To avoid problems with relations, import is actually done in two phases :
 * - planify everything
 * - actually run the import process
 */

const filesByEndpoint = {};
const handleError = function (e) {
  console.error(chalk.red('ERR'), e.toString());
  stats.recordErrors++;
};
 
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
    try {
      relationsToFind[url] = await axios.get(url);
      relationsToFind[url] = relationsToFind[url].data;
      if (operation === 'find') {
        relationsToFind[url] = relationsToFind[url][0];
      }
    } catch (e) {
      handleError(e);
    }
    if(relationsToFind[url] === undefined) {
      console.error(chalk.red('ERROR'), url);
      stats.relationErrors ++;
      relationsToFind[url] = { id: null };
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
  let res;
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
        res = await axios.post(postUrl, record);
      } else {
        const putUrl = `${provisionning_baseUrl}/${updateEndpoint}/${findResults[0].id}`;
        log('put to :', putUrl);
        res = await axios.put(putUrl, record);
      }
    } catch (e) {
      handleError(e);
    }
  } else {
    const postUrl = `${provisionning_baseUrl}/${createEndpoint}`;
    log('post to :', postUrl);
    try {
      res = await axios.post(postUrl, record);
    } catch (e) {
      handleError(e);
    }
  }
  if (record.__locales) {
    const locales = Object.keys(record.__locales);
    for (let l of locales) {
      log(`\timporting locale ${l} for object with id ${res.data.id}`);
      console.log(res.data);
      const postUrl = `${provisionning_baseUrl}/${updateEndpoint}/${res.data.id}/localizations`;
      try {
        const localeRes = await axios.post(postUrl, {
          ...record.__locales[l],
          locale: l,
        });
      } catch (e) {
        handleError(e);
      }
    }
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
  stats.recordTotal ++;
  console.log(chalk.green('OK'), 'Import done for file ', f);
}

const deleteEndpoint = async (endpoint) => {
  const findUrl = `${provisionning_baseUrl}/${endpoint}`;
  const find = await axios.get(findUrl + `?_limit=10000`);


  for (let i = 0; i < find.data.length; i++) {
    await axios.delete(`${provisionning_baseUrl}/${endpoint}/${find.data[i].id}`);
  }
};

const readConfig = async () => {
  try {
    config = require(pwd + '/provisioner/config.js');
    if (args.delete_first) {
      const deleteFirst = args.delete_first.split(',')
      for (let i = 0; i < deleteFirst.length; i++) {
        const endpoint = deleteFirst[i];
        deleteEndpoint(endpoint);
      }
    } else if (config.deleteFirst) {
      for (let i = 0; i < config.deleteFirst.length; i++) {
        const endpoint = config.deleteFirst[i].endpoint;
        deleteEndpoint(endpoint);
      }
    }
  } catch (e) {
    handleError(e);
  }
};

const importEndpoint = async (endpoint) => {
  console.log('import endpoint', endpoint);
  if (filesByEndpoint[endpoint] === undefined) {
    return;
  }
  for (let f of filesByEndpoint[endpoint].files) {
    await importFile(f);
  }
  filesByEndpoint[endpoint].importDone = true;
  for (let cb of filesByEndpoint[endpoint].afterCallbacks) {
    cb();
  }
};


const start = async () => {
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
    if (args.only_endpoints) {
      const endpoints = args.only_endpoints.split(',');
      for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        await importEndpoint(endpoint);
      }

    } else if (config.order) {
      for (let i = 0; i < config.order.length; i++) {
        const endpoint = config.order[i];
        await importEndpoint(endpoint);
      }
    } else {
      for(let endpoint in filesByEndpoint) {
        await importEndpoint(endpoint);
      }
    }
    console.log('stats', stats);
  }, 1000);
}


module.exports = {
  async start(email, password, baseUrl, _args) {
    args = _args;
    provisionning_email = email;
    provisionning_password = password;
    provisionning_baseUrl = baseUrl;
    console.log('Starting provisioning');
    console.log('------------------------------------------');
    console.log('- with root folder : ', pwd);
    console.log('- with strapi URL : ', baseUrl);
    console.log('------------------------------------------');

    await login();
    await readConfig();
    await start();
  }
}