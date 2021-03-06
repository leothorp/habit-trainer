// modules =================================================
var mongoose = require('mongoose');
var User = require('../models/user');
var GoogleUser = require('../models/googleUser');
var config = require('./config');
var utils = require('../middlewares/utils');

// database connection =====================================
var dbURI = process.env.MONGOLAB_URI || config.localdb;
mongoose.connect(dbURI);
var db = mongoose.connection;

db.on('error', function(err) {
  console.error('Mongoose connection error, retrying in 5 seconds.');
  setTimeout(function() {
    mongoose.connect(dbURI);
  }, 5000);
});
db.on('connected', function() {
  console.log('Mongoose connection open to ' + dbURI);
});
db.on('disconnected', function() {
  console.log('Mongoose connection disconnected.');
});

// daily refresh ===========================================
var cbInQueue = 0;
var collectionsQueued = 0;

//add code to calculate new average for past 10 days; if more than 10 days currently stored,
//shift off the oldest one
var update = function(err, users) {
  if (err) throw err;

  users.forEach(function(user) {
    cbInQueue++;

    user.habits.forEach(function(habit) {
      if (habit.active) {
        // skip updating streak count if user checks in between midnight and
        // when the database actually updates
        if (!utils.checkedInToday(habit) && !utils.checkedInYesterday(habit)) {
          habit.streak = 0;
          habit.failedCount++;
        }

        // reset notification status for the day
        habit.reminded = false;
        habit.failed = false;
      }
    });


    if (user.recentStats.length > 89) {
      user.recentStats.shift();
    }

    
    var previousDaysDifficulty = user.recentStats[user.recentStats.length - 1].possiblePointsThisDay;
    var newDay = {
      theDate: new Date;
      difficultyPointsEarned: 0,
      possiblePointsThisDay : previousDayDifficulty
    };
    user.recentStats.push(newDay);
    user.successPercentage = utils.calculateSuccessPercentage(user.recentStats);
    user.save(function(err) {
      if (err) throw err;

      cbInQueue--;

      if (cbInQueue === 0 && collectionsQueued === 2) {
        // disconnect if the other collection is also done updating
        // this would be a good place to refactor with promises
        mongoose.disconnect();
      }
    });
  });

  collectionsQueued++;
};

User.find({}, update);
GoogleUser.find({}, update);
