import {Container}             from 'reactstrap';
import React                   from 'react';
import {Route, Router, Switch} from 'react-router-dom';

import history                 from './history';
import Loading                 from './components/Loading.jsx';
import NavBar                  from './components/NavBar.jsx';
import PrivateRoute            from './components/PrivateRoute.jsx';
import {useAuth0}              from './react-auth0-spa';

import MyHome                  from './components/MyHome.jsx';
import Jalousie                from './components/Jalousie.jsx';
import Strom                   from './components/Strom.jsx';
import Profile                 from './components/Profile.jsx';

// styles
import './App.css';

const App = () => {
  const {loading} = useAuth0();

  if (loading) {
    return <Loading />;
  }

  document.title = 'MyHome';

  return (
    <Router history={history}>
      <div id='app' className='d-flex flex-column h-100'>
        <NavBar />
        <Container className='flex-grow-1 mt-5'>
          <Switch>
            <Route        path='/'        exact component={MyHome} />
            <PrivateRoute path='/profile'       component={Profile} />
            <PrivateRoute path='/jalousie'      component={Jalousie} />
            <PrivateRoute path='/strom'         component={Strom} />
          </Switch>
        </Container>
      </div>
    </Router>
  );
};

export default App;
