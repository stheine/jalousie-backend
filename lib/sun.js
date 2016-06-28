'use strict';

const pigpiod = require('pigpiod');



// The Sun sensor is connected to the MCP3204 A-D converter,
// connected to the Raspi on the SPI channel, opened in spiHandle,
// and on the MCP channel mcpChannel.
float getSunThreshold(pi, spiHandle, mcpChannel) {
  static int init = 0;
  static uint32_t valueTicks[SONNE_RING_BUFFER_LENGTH];
  static float a2dVals[SONNE_RING_BUFFER_LENGTH];
  static int head;
  int r;
  uint32_t nowTicks;
  int number;
  float summeA2dVals;
  float averageA2dVal;

  int a2dVal;
  int sonnenschwelle;
  static int letzteSonnenschwelle = -1;

  return new Promise((resolve, reject) => {
    if(init == 0) {
      for(r = 0; r < SONNE_RING_BUFFER_LENGTH; r++) {
        valueTicks[r]   = 0;
        a2dVals[r] = 0;
      }
      head = 0;

      init = 1;
    }

    a2dVal = pigpiod.mcp3204(pi, spiHandle, mcpChannel);

    nowTicks         = get_current_tick(pi);
    a2dVals[head]    = a2dVal;
    valueTicks[head] = nowTicks;
    head++;
    if(head >= SONNE_RING_BUFFER_LENGTH) {
      head = 0;
    }
    number = 0;
    summeA2dVals = 0;
    for(r = 0; r < SONNE_RING_BUFFER_LENGTH; r++) {
      if((nowTicks - valueTicks[r]) < (SONNE_RING_BUFFER_LENGTH + 1) * 1000000) {
        number++;
        summeA2dVals += a2dVals[r];
      }
    }
    averageA2dVal = summeA2dVals / number;

    // http://www.statistikpaket.de/x-y-plot/x-y-plot.php?a[]=0&b[]=3990&a[]=1&b[]=3675&a[]=2&b[]=3530&a[]=3&b[]=3250&a[]=4&b[]=2750&a[]=5&b[]=2500&a[]=6&b[]=2100&a[]=7&b[]=1800&a[]=8&b[]=1500&a[]=9&b[]=1100&a[]=10&b[]=700&a[]=11&b[]=350&a[]=12&b[]=200&a[]=13&b[]=150&a[]=14&b[]=100&a[]=15&b[]=50
    if(averageA2dVal > 3990) {
      sonnenschwelle = 0;
    } else if(averageA2dVal > 3675) {
      sonnenschwelle = 1;
    } else if(averageA2dVal > 3530) {
      sonnenschwelle = 2;
    } else if(averageA2dVal > 3250) {
      sonnenschwelle = 3;
    } else if(averageA2dVal > 2750) {
      sonnenschwelle = 4;
    } else if(averageA2dVal > 2500) {
      sonnenschwelle = 5;
    } else if(averageA2dVal > 2100) {
      sonnenschwelle = 6;
    } else if(averageA2dVal > 1800) {
      sonnenschwelle = 7;
    } else if(averageA2dVal > 1500) {
      sonnenschwelle = 8;
    } else if(averageA2dVal > 1100) {
      sonnenschwelle = 9;
    } else if(averageA2dVal >  700) {
      sonnenschwelle = 10;
    } else if(averageA2dVal >  350) {
      sonnenschwelle = 11;
    } else if(averageA2dVal >  200) {
      sonnenschwelle = 12;
    } else if(averageA2dVal >  150) {
      sonnenschwelle = 13;
    } else if(averageA2dVal >  100) {
      sonnenschwelle = 14;
    } else if(averageA2dVal >  50) {
      sonnenschwelle = 15;
    } else if(averageA2dVal > 0) {
      sonnenschwelle = 20;
    } else {
      // Ich darf hier keinen Fehlercode (999) setzen, da das ansonsten immer
      // den Sonnenalarm triggern wuerde.
      sonnenschwelle = 0;
    }

    logDebug("  Sonne: %d averageA2dVal=%04.0f\n", sonnenschwelle, averageA2dVal);

    writeStatus("sonnenschwelle", FMT_INT_02, (void *)&sonnenschwelle);
    writeStatus("sonneA2Dval",    FMT_FLOAT_04_0, (void *)&averageA2dVal);

    if(letzteSonnenschwelle != sonnenschwelle) {
      logDebug("Sonnenschwelle: %02d / %04.0f", sonnenschwelle, averageA2dVal);
      letzteSonnenschwelle = sonnenschwelle;
    }

    return resolve(sonnenschwelle);
  });
}
