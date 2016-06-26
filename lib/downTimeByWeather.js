#include <stdlib.h>
#include <time.h>

#include "config.h"
#include "wetter.h"
#include "troubleshooting.h"



// Wetter
extern int wetterSonnenUntergangStunden;
extern int wetterSonnenUntergangMinuten;
extern int wetterCode;



void wetterRunterZeit(int *calcRunterStunden, int *calcRunterMinuten,
  char **wetterLabel
) {
  int vorigeRunterStunden;
  int vorigeRunterMinuten;
  int offset = 0;
  time_t currentTimestamp;
  struct tm *currentTime;
  int calcTimeForStatus[2];

  vorigeRunterStunden = *calcRunterStunden;
  vorigeRunterMinuten = *calcRunterMinuten;

  readWeather();

  // https://developer.yahoo.com/weather/documentation.html#codes
  switch(wetterCode) {
    case  0:
      *wetterLabel = "tornado";
      offset = 0;
      break;

    case  1:
      *wetterLabel = "tropical storm";
      offset = 0;
      break;

    case  2:
      *wetterLabel = "hurricane";
      offset = 0;
      break;

    case  3:
      *wetterLabel = "severe thunderstorms";
      offset = 0;
      break;

    case  4:
      *wetterLabel = "thunderstorms";
      offset = 0;
      break;

    case  5:
      *wetterLabel = "mixed rain and snow";
      offset = 0;
      break;

    case  6:
      *wetterLabel = "mixed rain and sleet";
      offset = 0;
      break;

    case  7:
      *wetterLabel = "mixed snow and sleet";
      offset = 0;
      break;

    case  8:
      *wetterLabel = "freezing drizzle";
      offset = 0;
      break;

    case  9:
      *wetterLabel = "drizzle";
      offset = 0;
      break;

    case 10:
      *wetterLabel = "freezing rain";
      offset = 0;
      break;

    case 11:
      *wetterLabel = "showers";
      offset = 18;
      break;

    case 12:
      *wetterLabel = "showers";
      offset = 18;
      break;

    case 13:
      *wetterLabel = "snow flurries";
      offset = 0;
      break;

    case 14:
      *wetterLabel = "light snow showers";
      offset = 0;
      break;

    case 15:
      *wetterLabel = "blowing snow";
      offset = 0;
      break;

    case 16:
      *wetterLabel = "snow";
      offset = 0;
      break;

    case 17:
      *wetterLabel = "hail";
      offset = 0;
      break;

    case 18:
      *wetterLabel = "sleet";
      offset = 0;
      break;

    case 19:
      *wetterLabel = "dust";
      offset = 0;
      break;

    case 20:
      *wetterLabel = "foggy";
      offset = 0;
      break;

    case 21:
      *wetterLabel = "haze";
      offset = 0;
      break;

    case 22:
      *wetterLabel = "smoky";
      offset = 0;
      break;

    case 23:
      *wetterLabel = "blustery";
      offset = 0;
      break;

    case 24:
      *wetterLabel = "windy";
      offset = 23;
      break;

    case 25:
      *wetterLabel = "cold";
      offset = 23;
      break;

    case 26:
      *wetterLabel = "cloudy";
      offset = 23;
      break;

    case 27:
      *wetterLabel = "mostly cloudy (night)";
      offset = 23;
      break;

    case 28:
      *wetterLabel = "mostly cloudy (day)";
      offset = 23;
      break;

    case 29:
      *wetterLabel = "partly cloudy (night)";
      offset = 23;
      break;

    case 30:
      *wetterLabel = "partly cloudy (day)";
      offset = 23;
      break;

    case 31:
      *wetterLabel = "clear (night)";
      offset = 30;
      break;

    case 32:
      *wetterLabel = "sunny";
      offset = 30;
      break;

    case 33:
      *wetterLabel = "fair (night)";
      offset = 30;
      break;

    case 34:
      *wetterLabel = "fair (day)";
      offset = 30;
      break;

    case 35:
      *wetterLabel = "mixed rain and hail";
      offset = 0;
      break;

    case 36:
      *wetterLabel = "hot";
      offset = 0;
      break;

    case 37:
      *wetterLabel = "isolated thunderstorms";
      offset = 0;
      break;

    case 38:
      *wetterLabel = "scattered thunderstorms";
      offset = 0;
      break;

    case 39:
      *wetterLabel = "scattered showers"; // "scattered thunderstorms";
      offset = 18;
      break;

    case 40:
      *wetterLabel = "scattered showers";
      offset = 0;
      break;

    case 41:
      *wetterLabel = "heavy snow";
      offset = 0;
      break;

    case 42:
      *wetterLabel = "scattered snow showers";
      offset = 0;
      break;

    case 43:
      *wetterLabel = "heavy snow";
      offset = 0;
      break;

    case 44:
      *wetterLabel = "partly cloudy";
      offset = 0;
      break;

    case 45:
      *wetterLabel = "thundershowers";
      offset = 0;
      break;

    case 46:
      *wetterLabel = "snow showers";
      offset = 0;
      break;

    case 47:
      *wetterLabel = "isolated thundershowers";
      offset = 0;
      break;

    default:
      trigger_error("Unhandled wetterCode=%d", wetterCode);
      *wetterLabel = "unhandled";
      offset = 0;
      break;
  }

  *calcRunterStunden = wetterSonnenUntergangStunden;
  *calcRunterMinuten = wetterSonnenUntergangMinuten;

  if(offset) {
    *calcRunterMinuten += offset;
    while(*calcRunterMinuten < 0) {
      (*calcRunterStunden)--;
      *calcRunterMinuten += 60;
    }
    while(*calcRunterMinuten >= 60) {
      (*calcRunterStunden)++;
      *calcRunterMinuten -= 60;
    }
  }

  if(vorigeRunterStunden == *calcRunterStunden &&
     vorigeRunterMinuten == *calcRunterMinuten
  ) {
    // Es hat sich an der Schaltzeit nichts geändert.
    return;
  }

  if(vorigeRunterStunden == -1 ||
     vorigeRunterMinuten == -1
  ) {
    // Die vorige Schaltzeit war noch gar nicht konfiguriert.
    logMsg("SchaltzeitRunter Initiale Berechnung:\n"
      "                    wetterSonnenUntergang: %02d:%02d\n"
      "                    wetterCode=%d (%s), offset=%d\n"
      "                    calcRunter: %02d:%02d",
      wetterSonnenUntergangStunden, wetterSonnenUntergangMinuten,
      wetterCode, *wetterLabel, offset,
      *calcRunterStunden, *calcRunterMinuten);
  } else {
    // Zeit holen um zu prüfen, ob sich die Schaltzeit schon abgelaufen ist.
    currentTimestamp = time(NULL);
    currentTime = localtime(&currentTimestamp);

    int currHHMM = currentTime->tm_hour * 100 + currentTime->tm_min;
    int prevHHMM = vorigeRunterStunden  * 100 + vorigeRunterMinuten;
    int calcHHMM = *calcRunterStunden   * 100 + *calcRunterMinuten;

  //  if((currentTime->tm_hour < vorigeRunterStunden &&
  //      currentTime->tm_hour > *calcRunterStunden) ||
  //     (currentTime->tm_hour < vorigeRunterStunden &&
  //      currentTime->tm_hour == *calcRunterStunden &&
  //      currentTime->tm_min   > *calcRunterMinuten) ||
  //     (currentTime->tm_hour == vorigeRunterStunden &&
  //      currentTime->tm_hour == *calcRunterStunden &&
  //      currentTime->tm_min < vorigeRunterMinuten &&
  //      currentTime->tm_min > *calcRunterMinuten))

    if(calcHHMM < currHHMM && currHHMM < prevHHMM) {
      logMsg("SchaltzeitRunter Bereits vergangen -> TRIGGER NOW\n"
        "                    wetterSonnenUntergang: %02d:%02d\n"
        "                    wetterCode=%d (%s), offset=%d\n"
        "                    calcRunter: %02d:%02d",
        wetterSonnenUntergangStunden, wetterSonnenUntergangMinuten,
        wetterCode, *wetterLabel, offset,
        *calcRunterStunden, *calcRunterMinuten);

      *calcRunterStunden = currentTime->tm_hour;
      *calcRunterMinuten = currentTime->tm_min;
    } else {
      logMsg("SchaltzeitRunter Änderung:\n"
        "                    wetterSonnenUntergang: %02d:%02d\n"
        "                    wetterCode=%d (%s), offset=%d\n"
        "                    calcRunter: %02d:%02d",
        wetterSonnenUntergangStunden, wetterSonnenUntergangMinuten,
        wetterCode, *wetterLabel, offset,
        *calcRunterStunden, *calcRunterMinuten);
    }
  }

  calcTimeForStatus[0] = *calcRunterStunden;
  calcTimeForStatus[1] = *calcRunterMinuten;
  writeStatus("calcRunterTime", FMT_TIME, calcTimeForStatus);

  return;
}
