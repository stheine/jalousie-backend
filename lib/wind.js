'use strict';



// The Wind sensor is connected to the Raspi GPIO_WIND
// and is triggering an interrupt/ callback function to count
// the number of events, calculating the rate per second.
const getWindThreshold = function(pi) {
  static bool init = false;
  static uint32_t valueTicks[WIND_RING_BUFFER_LENGTH];
  static float windCounterVals[WIND_RING_BUFFER_LENGTH];
  static int head;
  int r;
  uint32_t nowTicks;
  int number;
  float summeWindCounterVals;

  static uint32_t windLastTicks = 0;
  int windTicksSinceLast;
  float windSecondsSinceLast;
  float windHertz;
  int windschwelle;
  int windCounterCurrent;

  static int letzteWindschwelle = -1;

  if(!init) {
    for(r = 0; r < WIND_RING_BUFFER_LENGTH; r++) {
      valueTicks[r]      = 0;
      windCounterVals[r] = 0;
    }
    head = 0;

    init = true;

    // Im ersten Lauf brauche ich nur die Werte zu initialisieren,
    // aber keine Berechnung und Ausgabe, da ich sowieso keine Zeitbasis zur
    // letzten Messung habe.
    windLastTicks = get_current_tick(pi);
    windCounter   = 0;
    return(0);
  }

//  trace("windCounter=%d", windCounter);
  windCounterCurrent = windCounter;
  windCounter = 0;

  nowTicks = get_current_tick(pi);

  // Versuche Ausreisser (wilde Interrupts) zu erkennen, indem ich den neuen
  // Wert mit der Summe der letzten Werte vergleiche.
  // Ist er > 10 (damit nicht alle Werte ausgeschlossen werden, da die
  // initiale Summe 0 ist) und höher, als die Summe der letzten Werte,
  // so nehme ich an, das es ein Ausreißer ist.
  number = 0;
  summeWindCounterVals = 0;
  for(r = 0; r < WIND_RING_BUFFER_LENGTH; r++) {
    if((nowTicks - valueTicks[r]) < (WIND_RING_BUFFER_LENGTH + 1) * 1000000) {
      number++;
      summeWindCounterVals += windCounterVals[r];
    }
  }
  if(number == 0) {
    logMsg("WindRingBuffer leer, keine Prüfung auf Ausreißer.");
  } else if(windCounterCurrent > 10 &&
            windCounterCurrent > summeWindCounterVals
  ) {
    // Ausreisser
    logMsg("WindCounter Ausreisser %d (summeWindCounterVals=%d, number=%d)",
      windCounterCurrent, summeWindCounterVals, number);

    return(letzteWindschwelle);
  }

  // Kein Ausreisser, also im RingBuffer speichern.
  windCounterVals[head] = windCounterCurrent;
  valueTicks[head]      = nowTicks;
  head++;
  if(head >= WIND_RING_BUFFER_LENGTH) {
    head = 0;
  }



  windTicksSinceLast = nowTicks - windLastTicks;
//  trace("windTicksSinceLast=%d", windTicksSinceLast);
  windSecondsSinceLast = (float)windTicksSinceLast / 1000000;
//  trace("windSecondsSinceLast=%f", windSecondsSinceLast);

  windHertz = windCounterCurrent / windSecondsSinceLast;
//  trace("windHertz=%f", windHertz);
  windLastTicks = get_current_tick(pi);

  if(windHertz <= 2.00) {
    windschwelle = 0;
  } else if(windHertz <= 5.78) {
    windschwelle = 1;
  } else if(windHertz <= 9.56) {
    windschwelle = 2;
  } else if(windHertz <= 13.34) {
    windschwelle = 3;
  } else if(windHertz <= 17.12) {
    windschwelle = 4;
  } else if(windHertz <= 20.90) {
    windschwelle = 5;
  } else if(windHertz <= 24.68) {
    windschwelle = 6;
  } else if(windHertz <= 28.46) {
    windschwelle = 7;
  } else if(windHertz <= 32.24) {
    windschwelle = 8;
  } else if(windHertz <= 36.02) {
    windschwelle = 9;
  } else if(windHertz <= 39.80) {
    windschwelle = 10;
  } else {
    windschwelle = 11;
  }
//  trace("windschwelle=%d", windschwelle);

//  trace("Wind:  %d %d/%3.1f (%05.2fHz)", windschwelle, windCounterCurrent,
//    windSecondsSinceLast, windHertz);

  writeStatus("windschwelle", FMT_INT_02, (void *)&windschwelle);
  writeStatus("windHertz",    FMT_FLOAT_05_2, (void *)&windHertz);

  if(letzteWindschwelle != windschwelle &&
     windschwelle > 1
  ) {
//    logMsg("Windschwelle: %02d / #%d/%3.1fs / %05.2fHz",
//      windschwelle, windCounterCurrent, windSecondsSinceLast, windHertz);
    letzteWindschwelle = windschwelle;
  }

  return windschwelle;
}
