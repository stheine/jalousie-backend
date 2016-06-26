'use strict';

const pigpiod = require('pigpiod');



// The KTY81 temperature sensor is connected to the MCP3204 A-D converter,
// connected to the Raspi on the SPI channel, opened in spiHandle,
// and on the MCP channel mcpChannel.
const kty81Temperature(pi, spiHandle, mcpChannel) {
  static int init = 0;
  static uint32_t valueTicks[TEMP_RING_BUFFER_LENGTH];
  static float temperaturen[TEMP_RING_BUFFER_LENGTH];
  static float widerstaende[TEMP_RING_BUFFER_LENGTH];
  static int head;
  int r;
  uint32_t nowTicks;
  int number;
  float summeTemperaturen;
  float summeWiderstaende;
  float averageTemperature;
  float averageRestistance;

  int a2dVal;
  int i;

  if(init == 0) {
    for(r = 0; r < TEMP_RING_BUFFER_LENGTH; r++) {
      valueTicks[r]   = 0;
      temperaturen[r] = 0;
      widerstaende[r] = 0;
    }
    head = 0;

    init = 1;
  }

  // *******************************************************************************
  // KTY81/210 resistor values from data sheet (in degree celsius)
  float KTY81Temperature[27] = {-55,  -50,  -40,  -30,  -20,  -10,    0,   10,   20,
    22.2, // 25.1.
    23.5, // 24.1. nach dem mitteln ueber 5
    25.1, // 24.1. nach dem mitteln ueber 5
    26.0, // 25.1
    30,   40,   50,   60,   70,   80,   90,  100,  110,  120,  125,  130,
     140,  150};
  float KTY81Resistor[27]    = {980, 1030, 1135, 1247, 1367, 1495, 1630, 1772, 1922,
    1961, // 22.2
    1989, // 23.5
    2010, // 25.1
    2019, // 26.0
    2080, 2245, 2417, 2597, 2785, 2980, 3192, 3392, 3607, 3817, 2915, 4008,
    4166, 4280};
  int KTY81NumTempSections = sizeof(KTY81Temperature) / sizeof(float);

  // Resistor value of voltage divider in ohm
  float KTY81DeviderResistor = 2000;

  a2dVal = pigpiod.mcp3204(pi, spiHandle, mcpChannel);

  float resistance = a2dVal / ((float) 4095 - a2dVal) * KTY81DeviderResistor;
  if(DEBUG) {
    printf("Temp: a2dVal=%d resistance=%04.0f\n", a2dVal, resistance);
  }
  float temperature = -999; // Kurzschluss
  for(i = 1; i < KTY81NumTempSections; i++) {
    if(resistance >= KTY81Resistor[i-1] && resistance <= KTY81Resistor[i]) {
      float p = (resistance - KTY81Resistor[i-1]) / (KTY81Resistor[i] - KTY81Resistor[i-1]);
      temperature = (KTY81Temperature[i] - KTY81Temperature[i-1]) * p + KTY81Temperature[i-1];
      if(DEBUG) {
        printf(
          "resistance=%04.0f KTY81Resistor[%d]=%04.0f KTY81Resistor[%d]=%04.0f\n"
          "p=%4.1f KTY81Temperature[%d]=%4.1f KTY81Temperature[%d]=%4.1f\n",
          resistance, i, KTY81Resistor[i], i-1, KTY81Resistor[i-1],
          p, i, KTY81Temperature[i], i-1, KTY81Temperature[i-1]);
        printf("resistance=%04.0f temperature=%4.1f\n", resistance, temperature);
      }

      break;
    }
  }
  if(resistance > KTY81Resistor[KTY81NumTempSections-1]) {
    temperature = 999; // Kein Sensor
  }

  if(DEBUG) {
    printf("  Temp: %4.1f°C resistance=%04.0f\n", temperature, resistance);
  }

  nowTicks           = get_current_tick(pi);
  temperaturen[head] = temperature;
  widerstaende[head] = resistance;
  valueTicks[head]   = nowTicks;
  head++;
  if(head >= TEMP_RING_BUFFER_LENGTH) {
    head = 0;
  }
  number = 0;
  summeTemperaturen = 0;
  summeWiderstaende = 0;
  for(r = 0; r < TEMP_RING_BUFFER_LENGTH; r++) {
    if((nowTicks - valueTicks[r]) < (TEMP_RING_BUFFER_LENGTH + 1) * 1000000) {
      number++;
      summeTemperaturen += temperaturen[r];
      summeWiderstaende += widerstaende[r];
    }
  }
  averageTemperature = summeTemperaturen / number;
  averageRestistance = summeWiderstaende / number;

  writeStatus("temperaturKTY",           FMT_FLOAT_4_1,
    (void *)&averageTemperature);
  writeStatus("temperaturKTYWiderstand", FMT_FLOAT_04_0,
    (void *)&averageRestistance);

  return averageTemperature;
}
