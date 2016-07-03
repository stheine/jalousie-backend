'use strict';

// https://github.com/stheine/pigpiod // TODO npm???
const pigpiod  = require('../../pigpiod'); // TODO switch to git installed module

const {logDebug, logInfo, logError} = require('./troubleshooting'); // TODO

// https://github.com/stheine/ringbufferjs
const Ringbuffer = require('ringbufferjs');



const MCP3204_SPI_CHANNEL = 0; // MCP3204 is connected to SPI channel #0
const MCP3204_CHANNEL_SUN = 0; // Sun sensor on MCP3204 channel #0

const SUN_RING_BUFFER_LENGTH = 5;



// The Sun sensor is connected to the MCP3204 A-D converter,
// connected to the Raspi on the SPI channel, opened in spiChannel,
// and on the MCP channel mcpChannel.
const sunRingbufferTicks  = new Ringbuffer(SUN_RING_BUFFER_LENGTH);
const sunRingbufferValues = new Ringbuffer(SUN_RING_BUFFER_LENGTH);
let   sunLastThreshold    = -1;

const getSunThreshold = function(pi) {
  return new Promise((resolve, reject) => {
    let   sunThreshold;
    const nowTicks = pigpiod.get_current_tick(pi);
    const a2dValue =
      pigpiod.mcp3204(pi, MCP3204_SPI_CHANNEL, MCP3204_CHANNEL_SUN);

    sunRingbufferTicks.enq(nowTicks);
    sunRingbufferValues.enq(a2dValue);

    // Remove outdated values from the ringbuffer.
    while(sunRingbufferTicks.size() &&
          (nowTicks - sunRingbufferTicks.peek()) >
            (SUN_RING_BUFFER_LENGTH + 1) * 1000000
    ) {
      logDebug('Removing outdated value from sun ringbuffer');
      sunRingbufferValues.deq();
      sunRingbufferTicks.deq();
    }

    const averageA2dValue = sunRingbufferValues.avg();

    logDebug(`${sunRingbufferValues.dump()} => avg()=${averageA2dValue}`);

    // http://www.statistikpaket.de/x-y-plot/x-y-plot.php?a[]=0&b[]=3990&a[]=1&b[]=3675&a[]=2&b[]=3530&a[]=3&b[]=3250&a[]=4&b[]=2750&a[]=5&b[]=2500&a[]=6&b[]=2100&a[]=7&b[]=1800&a[]=8&b[]=1500&a[]=9&b[]=1100&a[]=10&b[]=700&a[]=11&b[]=350&a[]=12&b[]=200&a[]=13&b[]=150&a[]=14&b[]=100&a[]=15&b[]=50
    if(averageA2dValue > 3990) {
      sunThreshold = 0;
    } else if(averageA2dValue > 3675) {
      sunThreshold = 1;
    } else if(averageA2dValue > 3530) {
      sunThreshold = 2;
    } else if(averageA2dValue > 3250) {
      sunThreshold = 3;
    } else if(averageA2dValue > 2750) {
      sunThreshold = 4;
    } else if(averageA2dValue > 2500) {
      sunThreshold = 5;
    } else if(averageA2dValue > 2100) {
      sunThreshold = 6;
    } else if(averageA2dValue > 1800) {
      sunThreshold = 7;
    } else if(averageA2dValue > 1500) {
      sunThreshold = 8;
    } else if(averageA2dValue > 1100) {
      sunThreshold = 9;
    } else if(averageA2dValue >  700) {
      sunThreshold = 10;
    } else if(averageA2dValue >  350) {
      sunThreshold = 11;
    } else if(averageA2dValue >  200) {
      sunThreshold = 12;
    } else if(averageA2dValue >  150) {
      sunThreshold = 13;
    } else if(averageA2dValue >  100) {
      sunThreshold = 14;
    } else if(averageA2dValue >  50) {
      sunThreshold = 15;
    } else if(averageA2dValue > 0) {
      sunThreshold = 20;
    } else {
      // Don't set an error code (like 999),
      // as otherwise this would trigger the sunThreshold always.
      sunThreshold = 0;
    }

    logDebug(`Sun: ${sunThreshold} averageA2dValue=${averageA2dValue}`);

    if(sunLastThreshold != sunThreshold) {
      logDebug(`SunThreshold: ${sunThreshold} / ${averageA2dValue}`);
      sunLastThreshold = sunThreshold;
    }

    return resolve(sunThreshold);
  });
};



module.exports = {
  getSunThreshold
};
