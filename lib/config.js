'use strict';

// *********************************************************************************
// Configuration
int configSonneRunterSchwelle      = -1;
int configTemperaturRunterGrad     = -1;
int configSonneRunterVerzoegerung  = -1;
int configSonneRunterPosition      = -1;
int configSonneRunterWendung       = -1;
int configSonneHochSchwelle        = -1;
int configSonneHochVerzoegerung    = -1;
int configWindHochSchwelle         = -1;
int configSchaltzeitRunterStunden  = -1;
int configSchaltzeitRunterMinuten  = -1;
int configSchaltzeitHochStunden    = -1;
int configSchaltzeitHochMinuten    = -1;

// Wetter
int wetterSonnenAufgangStunden     = -1;
int wetterSonnenAufgangMinuten     = -1;
int wetterSonnenUntergangStunden   = -1;
int wetterSonnenUntergangMinuten   = -1;
int wetterCode                     = -1;



char *xmlGetValue(void *xpathCtx, char *xpathExpr) {
  xmlXPathObjectPtr xpathObj;
  xmlNodePtr node;

  xpathObj = xmlXPathEvalExpression((xmlChar *)xpathExpr, (xmlXPathContextPtr)xpathCtx);
  if(xpathObj == NULL) {
    trigger_error("Error: unable to evaluate xpath expression '%s'", xpathExpr);
    return("-1");
  }

  /* Store result */
  if(xpathObj->nodesetval->nodeNr != 1) {
    trigger_error("Invalid number of nodes searching for '%s'", xpathExpr);
    xmlXPathFreeObject(xpathObj);
    return("-1");
  }
  node = xpathObj->nodesetval->nodeTab[0];
  if(node->type != XML_ELEMENT_NODE) {
    trigger_error("Unexpected node '%s' type %d", node->name, node->type);
    xmlXPathFreeObject(xpathObj);
    return("-1");
  }

  xmlXPathFreeObject(xpathObj);

  return((char *)xmlNodeGetContent(node));
}

int readConfig() {
  char *filename = "/var/aerotec/config.xml";
  xmlDocPtr doc;
  xmlXPathContextPtr xpathCtx;

  /* Initialize XML parser */
  xmlInitParser();

  /* Load XML document */
  doc = xmlParseFile(filename);
  if(doc == NULL) {
    trigger_error("Error: unable to parse file '%s'", filename);
    return(-1);
  }

  /* Create xpath evaluation context */
  xpathCtx = xmlXPathNewContext(doc);
  if(xpathCtx == NULL) {
    trigger_error("Error: unable to create new XPath context");
    xmlFreeDoc(doc);
    return(-1);
  }

  // Read the Aerotec config values into the globals
  configSonneRunterSchwelle        = atoi(xmlGetValue(xpathCtx,
    "//config//sonne//runter//schwelle"));
  configTemperaturRunterGrad       = atoi(xmlGetValue(xpathCtx,
    "//config//temperatur//runter//grad"));
  configSonneRunterVerzoegerung    = atoi(xmlGetValue(xpathCtx,
    "//config//sonne//runter//verzoegerung"));
  configSonneRunterPosition        = atoi(xmlGetValue(xpathCtx,
    "//config//sonne//runter//position"));
  configSonneRunterWendung         = atoi(xmlGetValue(xpathCtx,
    "//config//sonne//runter//wendung"));
  configSonneHochSchwelle          = atoi(xmlGetValue(xpathCtx,
    "//config//sonne//hoch//schwelle"));
  configSonneHochVerzoegerung      = atoi(xmlGetValue(xpathCtx,
    "//config//sonne//hoch//verzoegerung"));
  configWindHochSchwelle           = atoi(xmlGetValue(xpathCtx,
    "//config//wind//hoch//schwelle"));
  configSchaltzeitRunterStunden    = atoi(xmlGetValue(xpathCtx,
    "//config//schaltzeit//runter//stunden"));
  configSchaltzeitRunterMinuten    = atoi(xmlGetValue(xpathCtx,
    "//config//schaltzeit//runter//minuten"));
  configSchaltzeitHochStunden      = atoi(xmlGetValue(xpathCtx,
    "//config//schaltzeit//hoch//stunden"));
  configSchaltzeitHochMinuten      = atoi(xmlGetValue(xpathCtx,
    "//config//schaltzeit//hoch//minuten"));

  /* Cleanup */
  xmlXPathFreeContext(xpathCtx);
  xmlFreeDoc(doc);

  /* Shutdown libxml */
  xmlCleanupParser();

  return(0);
}

// Eigene Implementierung, da strptime mit %p (am/pm) nicht umgehen kann.
// Vermutlich wegen falscher locale???
void convertAmPmTime(char *amPmTime, int *hour24, int *min) {
  char *minStart;
  char *amPmStart;

  // The times as given in the Yahoo weather data could be given in various formats:
  // 6:5 pm
  // 7:15 pm
  // 10:1 pm
  // 11:20 pm
  // Hours given in one or two digits?
  if(amPmTime[1] == ':') {
    minStart  = &amPmTime[2];
  } else {
    minStart  = &amPmTime[3];
  }
  // am/pm is given at the end. Read based on strlen(),
  // since the minutes could also be given in one or two digits.
  amPmStart = &amPmTime[strlen(amPmTime) - 2];
  *hour24 = atoi(amPmTime);
  *min    = atoi(minStart);
  if(amPmStart[0] == 'a' &&
     *hour24 == 12
  ) {
    *hour24 = 0;
  } else if(amPmStart[0] == 'p') {
    *hour24 += 12;
  }
}

int readWeather() {
  char *filename = "/var/aerotec/wetter.xml";
  xmlDocPtr doc;
  xmlXPathContextPtr xpathCtx;

  /* Initialize XML parser */
  xmlInitParser();

  /* Load XML document */
  doc = xmlParseFile(filename);
  if(doc == NULL) {
    trigger_error("Error: unable to parse file '%s'", filename);
    return(-1);
  }

  /* Create xpath evaluation context */
  xpathCtx = xmlXPathNewContext(doc);
  if(xpathCtx == NULL) {
    trigger_error("Error: unable to create new XPath context");
    xmlFreeDoc(doc);
    return(-1);
  }

  // Read the Aerotec config values into the globals
  // <sunrise>6:44 am</sunrise>
  // <sunset>6:21 pm</sunset>
  // <current_code>27</current_code>
  convertAmPmTime(xmlGetValue(xpathCtx, "//info//sunrise"),
    &wetterSonnenAufgangStunden, &wetterSonnenAufgangMinuten);
  convertAmPmTime(xmlGetValue(xpathCtx, "//info//sunset"),
    &wetterSonnenUntergangStunden, &wetterSonnenUntergangMinuten);
//  logMsg("wetterSonnenaufgang: %d:%d", wetterSonnenAufgangStunden,
//      wetterSonnenAufgangMinuten);
//  logMsg("wetterSonnenuntergang: %d:%d", wetterSonnenUntergangStunden,
//      wetterSonnenUntergangMinuten);

  // https://developer.yahoo.com/weather/documentation.html#codes
  wetterCode = atoi(xmlGetValue(xpathCtx, "//info//current_code"));
  writeStatus("wetterCode", FMT_INT, &wetterCode);

  /* Cleanup */
  xmlXPathFreeContext(xpathCtx);
  xmlFreeDoc(doc);

  /* Shutdown libxml */
  xmlCleanupParser();

  return(0);
}

int writeStatus(char *element, int valueType, void *value) {
  char *filename = "/var/aerotec/status.xml";
  static xmlDocPtr doc = NULL;
  static xmlNodePtr rootNode;
  static char *xpathExpr;
  static xmlXPathContextPtr xpathCtx;
  static char *valueString;
  time_t currentTimestamp;
  struct tm *currentTime;
  xmlXPathObjectPtr xpathObj;
  xmlNodePtr node;
  uint32_t timerLength;
  int timerLengthSeconds;
  int timerLengthMinutes;
  int timerLengthHours;

  if(doc == NULL) {
    doc = xmlNewDoc((xmlChar *)"1.0");
    rootNode = xmlNewNode(NULL, (xmlChar *)"status");
    xmlDocSetRootElement(doc, rootNode);

    xpathExpr = malloc(100); // wird schon reichen...
    xpathCtx = xmlXPathNewContext(doc);
    valueString = malloc(100); // wird schon reichen...
  }

  // Find element, fals schon vorhanden, und loesche ggf.
  sprintf(xpathExpr, "//status//%s", element);
  xpathObj = xmlXPathEvalExpression((xmlChar*)xpathExpr, xpathCtx);
  if(xpathObj != NULL &&
     xpathObj->type == 1 &&
     xpathObj->nodesetval->nodeNr > 0
  ) {
//    trace("Clean '%s'", element);
    node = xpathObj->nodesetval->nodeTab[0];
    xmlUnlinkNode(node);
    xmlFreeNode(node);
    node = NULL;
    xmlXPathFreeObject(xpathObj);
  }

  // Fuege neues element hinzu
  node = xmlNewNode(NULL, (xmlChar *)element);
//  trace("Add '%s'", element);
  switch(valueType) {
    case FMT_FLOAT:
      sprintf(valueString, "%f", *(float *)value);
      break;


  #define FMT_INT        20
  #define FMT_INT_02     21

    case FMT_FLOAT_2_0:
      sprintf(valueString, "%2.0f", *(float *)value);
      break;

    case FMT_FLOAT_2_1:
      sprintf(valueString, "%2.1f", *(float *)value);
      break;

    case FMT_FLOAT_04_0:
      sprintf(valueString, "%04.0f", *(float *)value);
      break;

    case FMT_FLOAT_4_1:
      sprintf(valueString, "%4.1f", *(float *)value);
      break;

    case FMT_FLOAT_05_2:
      sprintf(valueString, "%05.2f", *(float *)value);
      break;

    case FMT_INT:
      sprintf(valueString, "%d", *(int *)value);
      break;

    case FMT_INT_02:
      sprintf(valueString, "%02d", *(int *)value);
      break;

    case FMT_NOW:
      currentTimestamp = time(NULL);
      currentTime = localtime(&currentTimestamp);
      sprintf(valueString, "%02d:%02d:%02d", currentTime->tm_hour,
        currentTime->tm_min, currentTime->tm_sec);
      break;

    case FMT_STRING:
      sprintf(valueString, "%s", (char *)value);
      break;

    case FMT_TIMER:
      if(*(double *)value) {
        timerLength = time_time() - *(double *)value;
        timerLengthSeconds = (timerLength) % 60;
        timerLengthMinutes = (timerLength/ 60) % 60;
        timerLengthHours   = (timerLength/ 60 / 60) % 24;
        sprintf(valueString, "%02d:%02d:%02d",
          timerLengthHours, timerLengthMinutes, timerLengthSeconds);
      } else {
        sprintf(valueString, "-");
      }
      break;

    case FMT_TIME:
      sprintf(valueString, "%02d:%02d", ((int *)value)[0], ((int *)value)[1]);
      break;

    case FMT_FLAG:
      if(*(bool *)value) {
        sprintf(valueString, "X");
      } else {
        sprintf(valueString, "-");
      }
      break;

    default:
      trigger_error("Unhandled valueType='%d'", valueType);
      return(1);
      break;
  }
  xmlNodeSetContent(node, (xmlChar *)valueString);
  xmlAddChild(rootNode, node);

  xmlSaveFormatFileEnc(filename, doc, "UTF-8", 0);
//  xmlDocFormatDump(statusHandle, doc, 0);

  return(0);
}
