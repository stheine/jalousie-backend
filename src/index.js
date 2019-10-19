/* eslint-disable react/jsx-filename-extension */

import React              from 'react';
import ReactDOM           from 'react-dom';

import App                from './App.jsx';
import {Auth0Provider}    from './react-auth0-spa';
import config             from './auth_config.json';
import history            from './history';
import * as serviceWorker from './serviceWorker';

// style
import './index.css';

const onRedirectCallback = appState => {
  if(window.location.search.startsWith('?code=')) {
    const newHref = `${window.location.protocol}//${window.location.host}` +
      `${window.location.pathname}#${appState.targetUrl}`;

    window.location.href = newHref;

    return;
  }

  history.push(appState && appState.targetUrl ?
    appState.targetUrl :
    window.location.pathname);
};

ReactDOM.render(
  <Auth0Provider
    domain={config.domain}
    client_id={config.clientId}
    redirect_uri={window.location.href}
    audience={config.audience}
    onRedirectCallback={onRedirectCallback}
  >
    <App />
  </Auth0Provider>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
