#!/usr/bin/env node

'use strict';

const pigpio = require('pigpio');
// const delay  = require('delay');

const Gpio = pigpio.Gpio;

// *************************************************************************
// const GPIO_JALOUSIE_DOWN =  4; // GPIO4,  Pin7  - Output - Jalousie down
const GPIO_JALOUSIE_UP   = 17; // GPIO17, Pin11 - Output - Jalousie up

const JALOUSIE_ON    = 1;
const JALOUSIE_OFF   = 0;

// main
// pigpio.initialize();

console.log(1);

// output, init 0 -> Transistor open -> Jalousie pull-up remains on 5V.
const gpioJalousieUp   = new Gpio(GPIO_JALOUSIE_UP,   {mode: Gpio.OUTPUT});
// const gpioJalousieDown = new Gpio(GPIO_JALOUSIE_DOWN, {mode: Gpio.OUTPUT});

console.log(2);

// case 'JALOUSIE_STOP':
// It's ok to signal stop in either direction.
gpioJalousieUp.digitalWrite(JALOUSIE_ON);
console.log(3);
setTimeout(() => {
  console.log(4);
  gpioJalousieUp.digitalWrite(JALOUSIE_OFF);
  console.log(5);
}, 140);

console.log(7);
