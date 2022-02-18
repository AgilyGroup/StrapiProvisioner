const glob = require("glob");
const axios = require("axios");
const qs = require('qs');

const baseUrl = process.env.EXTERNAL_API_URL;
const pwd = process.env.PWD;
let provisionning_email;
let provisionning_password;

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
  if (record.__upsertFilter) {
    const query = qs.stringify(record.__upsertFilter, { encodeValuesOnly: true });

    try {
      const find = await axios.get(`${baseUrl}/${endpoint}?${query}`);
      if (find.data.length === 0) {
        const res = await axios.post(`${baseUrl}/${endpoint}`, record);
      } else {
        const res = await axios.put(`${baseUrl}/${endpoint}/${find.data[0].id}`, record);
      }
    } catch (e) {
      console.log('req error ', e.response.data);
    }
  } else {
    const res = await axios.post(`${baseUrl}/${endpoint}`, record);
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
  start(email, password) {
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