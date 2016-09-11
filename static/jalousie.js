function updateIfSet(status, label) {
  if(status[label] === false) {
    $('#' + label).html('-');
  } else {
    $('#' + label).html(status[label]);
  }
}

function getAerotecData() {
  $.get('status').done(function(status) {
    if(status.process) {
//      console.log(status);
      if(status.process === 'stopped') {
        $('#process').css('background-color', 'rgba(255,0,0,1)');

        // Anzeige
        $('#temperatureOutside').html("-");
//        $('#temperatureKty').html("-");
        $('#temperatureDht').html("-");
        $('#humidity').html("-");
        $('#sunThreshold').html("-");
        $('#windThreshold').html("-");
        $('#mode').html("-");
        $('#weatherCode').html("-");
        $('#weatherText').html("-");

        // Internals
        $('#process').html(status.process);
//        $('#temperatureKtyWiderstand').html("-");
//        $('#sonneA2Dval').html("-");
//        $('#windHertz').html("-");
        $('#time').html("-");
        $('#flagNight').html("-");
        $('#flagSun').html("-");
        $('#flagWindalarm').html("-");
        $('#timerSunUp').html("-");
        $('#timerSunDown').html("-");
        $('#timerWind').html("-");
        $('#nightDownTime').html("-");
      } else if(status.process === 'running') {
        $('#process').css('background-color', 'rgba(255,255,255,1)');

        // Anzeige
        updateIfSet(status, 'temperatureOutside');
//        updateIfSet(status, 'temperatureKty');
        updateIfSet(status, 'temperatureDht');
        updateIfSet(status, 'humidity');
        updateIfSet(status, 'sunThreshold');
        updateIfSet(status, 'windThreshold');
        updateIfSet(status, 'mode');
        updateIfSet(status, 'weatherCode');
        updateIfSet(status, 'weatherText');

        // Internals
        updateIfSet(status, 'process');
//        updateIfSet(status, 'temperatureKtyWiderstand');
//        updateIfSet(status, 'sonneA2Dval');
//        updateIfSet(status, 'windHertz');
        updateIfSet(status, 'time');
        updateIfSet(status, 'flagNight');
        updateIfSet(status, 'flagSun');
        updateIfSet(status, 'flagWindalarm');
        updateIfSet(status, 'timerSunUp');
        updateIfSet(status, 'timerSunDown');
        updateIfSet(status, 'timerWind');
        updateIfSet(status, 'nightDownTime');
      } else {
        $('#process').css('background-color', 'rgba(255,255,0,1)');

        // Internals
        $('#process').html(status.process);

        return;
      }
    }
  });
}

$(document).ready(function() {
  // Initialize jquery-ui elements
  $('button').button();

  // Set click events
  $('#fullUp').mousedown(function() {
    $.ajax({url: 'fullUp'});
  });

//  $('#up').mousedown(function() {
//    $.ajax({url: 'upClick'});
//  });

//  $('#up').mouseup(function() {
//    $.ajax({url: 'upRelease'});
//  });

  $('#stop').mousedown(function() {
    $.ajax({url: 'stop'});
  });

//  $('#down').mousedown(function() {
//    $.ajax({url: 'downClick'});
//  });

//  $('#down').mouseup(function() {
//    $.ajax({url: 'downRelease'});
//  });

  $('#fullDown').mousedown(function()
  {
    $.ajax({url: 'fullDown'});
  });

  $('#shadow').mousedown(function() {
    $.ajax({url: 'shadow'});
  });

  $('#turn').mouseup(function() {
    $.ajax({url: 'turn'});
  });

  // Schedule the update function to run every second.
  // This survives the computer hibernating (contrary to setTimeout())
  setInterval(getAerotecData, 1000);
});
