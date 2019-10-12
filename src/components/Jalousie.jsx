import _                            from 'lodash';
import millisecond                  from 'millisecond';
import React, {useEffect, useState} from 'react';

import {useAuth0}                   from '../react-auth0-spa';

// style
import './Jalousie.css';

const fields = {
  Daten: {
    temperature:        {label: 'Temperatur innen',  unit: '°C'},
    temperatureDht:     {label: 'Temperatur DHT',    unit: '°C'},
    temperatureOutside: {label: 'Temperatur aussen', unit: '°C'},
    humidity:           {label: 'Luftfeuchtigkeit',  unit: '%rH'},
    time:               {label: 'Zeit'},
  },
  Wetter: {
    weatherDescription: {label: 'Wetter'},
    weatherMain:        {label: 'Wetter'},
    weatherCode:        {label: 'Code'},
    sunrise:            {label: 'Sonnenaufgang'},
    sunset:             {label: 'Sonnenuntergang'},
    nightDownTime:      {label: 'Abends runter'},
    sunThreshold:       {label: 'Sonne'},
    windThreshold:      {label: 'Wind'},
    rainLevel:          {label: 'Regen'},
  },
  Strom: {
    momentanLeistung:   {label: 'Verbrauch aktuell', unit: 'W'},
  },
  Intern: {
    process:            {label: 'Prozess'},
    mode:               {label: 'Modus'},
    timerSunUp:         {},
    timerSunDown:       {},
    timerWind:          {},
    flagNight:          {},
    flagSun:            {},
    flagWindalarm:      {},
  },
//  Anderes: {},
};

const Jalousie = () => {
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

  const output = [];

  for(const section of _.keys(fields)) {
    const sectionOutput = [];

    if(section === 'Anderes') {
      _.forEach(data, (value, field) => {
        sectionOutput.push(<div key={`label-${field}`} className='colLeft'>{field}</div>);
        sectionOutput.push(<div key={`value-${field}`} className='colRight'>{value}</div>);

        Reflect.deleteProperty(data, field);
      });
    } else {
      _.forEach(fields[section], (fieldData, field) => {
        const {label, unit} = fieldData;

        sectionOutput.push(
          <div key={`label-${field}`} className='colLeft'>
            {label || field}
          </div>
        );
        sectionOutput.push(
          <div key={`value-${field}`} className='colRight'>
            {data[field]}{unit ? ` ${unit}` : ''}
          </div>
        );

        Reflect.deleteProperty(data, field);
      });
    }

    output.push(
      <div className='jalousie__container' key={section}>
        <h1>{section}</h1>
        {sectionOutput}
      </div>
    );
  }

  return output;
};

export default Jalousie;