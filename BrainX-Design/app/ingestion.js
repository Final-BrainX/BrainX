(function () {
  function getToken() {
    return localStorage.getItem('accessToken');
  }

  async function req(method, path, body, params) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let url = '/api/ingestion' + path;
    if (params) url += '?' + new URLSearchParams(params).toString();

    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });

    if (res.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.hash = '/login';
      throw new Error('Unauthorized');
    }

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Request failed');
    return json;
  }

  window.ingestionApi = {
    notion: {
      authorize: () => req('POST', '/v1/imports/notion/oauth/authorize'),
      callback: (code, state) => req('POST', '/v1/imports/notion/oauth/callback', { code, state }),
      getPages: (integrationAccountId) => req('GET', '/v1/imports/notion/pages', null, { integrationAccountId }),
      createJob: (data) => req('POST', '/v1/imports/notion/jobs', data),
    },
    obsidian: {
      createJob: (data) => req('POST', '/v1/imports/obsidian/jobs', data),
    },
    importJob: {
      getStatus: (importJobId) => req('GET', '/v1/imports/' + importJobId),
    },
    export: {
      create: (data) => req('POST', '/v1/exports', data),
      getStatus: (exportJobId) => req('GET', '/v1/exports/' + exportJobId),
    },
  };
})();
