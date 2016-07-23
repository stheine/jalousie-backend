'use strict';

/* eslint-disable max-statements */

// https://github.com/stheine/ringbufferjs
const Ringbuffer = require('ringbufferjs');
// http://momentjs.com/docs
const moment     = require('moment');
const _          = require('lodash');

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod    = require('../../pigpiod'); // TODO switch to git installed module

const {logDebug, logError} = require('./troubleshooting');



const MCP3204_SPI_CHANNEL   = 0; // MCP3204 is connected to SPI channel #0
const MCP3204_CHANNEL_KTY81 = 1; // KTY81 sensor on MCP3204 channel #1

const TEMP_RING_BUFFER_LENGTH = 5;



// Resistor value of voltage divider in ohm
const kty81DeviderResistor = 2000;

// KTY81/210 resistor values from data sheet (in degree celsius)
// The values between 20 and 30 degrees are adjusted,
// based on real measurements.
const kty81ResistanceToTemperature = {
  980:  -55,
  1030: -50,
  1135: -40,
  1247: -30,
  1367: -20,
  1495: -10,
  1630:   0,
  1772:  10,
  1922:  20,
  1961:  22.2,
  1989:  23.5,
  2010:  25.1,
  2019:  26.0,
  2080:  30,
  2245:  40,
  2417:  50,
  2597:  60,
  2785:  70,
  2980:  80,
  3192:  90,
  3392: 100,
  3607: 110,
  3817: 120,
  2915: 125,
  4008: 130,
  4166: 140,
  4280: 150
};
const kty81ResistorValues = _.keys(kty81ResistanceToTemperature);



// The KTY81 temperature sensor is connected to the MCP3204 A-D converter,
// connected to the Raspi on the SPI channel, opened in spiHandle,
// and on the MCP channel mcpChannel.
const tempRingbufferTicks  = new Ringbuffer(TEMP_RING_BUFFER_LENGTH);
const tempRingbufferValues = new Ringbuffer(TEMP_RING_BUFFER_LENGTH);

const getTemperature = function(pi) {
  return new Promise(resolve => {
    let   temperature;
    const nowTicks = pigpiod.get_current_tick(pi);
    const a2dValue =
      pigpiod.mcp3204(pi, MCP3204_SPI_CHANNEL, MCP3204_CHANNEL_KTY81);

    // Remove outdated values from the ringbuffer.
    while(tempRingbufferTicks.size() &&
          (nowTicks - tempRingbufferTicks.peek()) >
            (TEMP_RING_BUFFER_LENGTH + 5) * 1000000
    ) {
      logDebug('Removing outdated value from temp ringbuffer');
      tempRingbufferValues.deq();
      tempRingbufferTicks.deq();
    }

    const resistance = a2dValue / (4095 - a2dValue) * kty81DeviderResistor;

    if(resistance < _.first(kty81ResistorValues)) {
      logError('KTY81 Temperature sensor shortcut');
      temperature = -999;
    } else if(resistance > _.last(kty81ResistorValues)) {
      logError('KTY81 Temperature sensor missing');
      temperature =  999;
    } else {
      for(let i = 1; i < _.size(kty81ResistanceToTemperature); i++) {
        const resistorPrev = kty81ResistorValues[i - 1];
        const resistorCurr = kty81ResistorValues[i];

        if(resistance >= resistorPrev && resistance <= resistorCurr) {
          const tempPrev = kty81ResistanceToTemperature[resistorPrev];
          const tempCurr = kty81ResistanceToTemperature[resistorCurr];
          const pct =
            (resistance - resistorPrev) / (resistorCurr - resistorPrev);

          temperature = tempPrev + (tempCurr - tempPrev) * pct;

//          logDebug(
//            `${resistorPrev}Ω  ${resistance.toFixed(0)}Ω  ${resistorCurr}Ω\n` +
//            `[${i-1}]    ${(pct * 100).toFixed(0)}%   [${i}]\n` +
//            `${tempPrev.toFixed(1)}°C ${temperature.toFixed(1)}°C ${tempCurr.toFixed(1)}°C`);

          break;
        }
      }
    }

//    logDebug(`KTY81: a2dValue=${a2dValue.toFixed(0)} ` +
//      `resistance=${resistance.toFixed(0)} ` +
//      `temperature=${temperature.toFixed(1)}°C`);

    tempRingbufferTicks.enq(nowTicks);
    tempRingbufferValues.enq(temperature);

    // logDebug(`${tempRingbufferValues.dump()} avg()=${tempRingbufferValues.avg().toFixed(1)}`);
    const averageTemperature = tempRingbufferValues.avg();

    return resolve({
      temperature: averageTemperature,
      timestamp:   moment()
    });
  });
};



module.exports = {
  getTemperature
};
