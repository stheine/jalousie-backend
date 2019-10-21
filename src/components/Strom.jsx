import millisecond                  from 'millisecond';
import React, {useEffect, useState} from 'react';

import {useAuth0}                   from '../react-auth0-spa';

// style
import './Strom.css';

const Strom = () => {
  const [data, setData] = useState({});

  const {getTokenSilently, loading} = useAuth0();

  useEffect(() => {
    const getData = async function() {
      const token = await getTokenSilently();

      const response = await fetch('/rest/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseData = await response.json();

      setData(responseData);
    };

    if(!loading) {
      getData();
    }

    const interval = setInterval(() => {
      if(!loading) {
        getData();
      }
    }, millisecond('1 second'));

    return () => clearInterval(interval);
  }, [getTokenSilently, loading]);

  return (
    <div className='strom__container'>
      <div className='value'>{(data.momentanLeistung || 0).toFixed(0)}</div>
      <div className='solar'>
        <div className='valueSolar'>P: {(data.power || 0).toFixed(0)}</div>
        <div className='valueSolar'>Q: {(data.reactivePower || 0).toFixed(0)}</div>
        <div className='valueSolar'>S: {(data.apparentPower || 0).toFixed(0)}</div>
      </div>
    </div>
  );
};

export default Strom;
