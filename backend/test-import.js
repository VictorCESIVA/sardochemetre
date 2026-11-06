#!/usr/bin/env node

/**
 * Test script to verify all backend modules can be imported without errors
 */

console.log('Testing module imports...\n');

try {
  console.log('✓ Loading environment variables...');
  require('dotenv').config();
  
  console.log('✓ Importing express...');
  const express = require('express');
  
  console.log('✓ Importing pg...');
  const { Pool } = require('pg');
  
  console.log('✓ Importing cors...');
  const cors = require('cors');
  
  console.log('✓ Importing node-cron...');
  const cron = require('node-cron');
  
  console.log('✓ Importing claudeService...');
  const claudeService = require('./services/claudeService');
  
  console.log('✓ Importing twitterService...');
  const twitterService = require('./services/twitterService');
  
  console.log('✓ Importing tweets router...');
  const tweetsRouter = require('./routes/tweets');
  
  console.log('✓ Importing scheduler...');
  const scheduler = require('./scheduler');
  
  console.log('\n✅ All modules imported successfully!');
  console.log('\nModule exports check:');
  console.log('  - claudeService.analyzeTweet:', typeof claudeService.analyzeTweet);
  console.log('  - twitterService.getRecentTweets:', typeof twitterService.getRecentTweets);
  console.log('  - scheduler.startScheduler:', typeof scheduler.startScheduler);
  console.log('  - scheduler.runNow:', typeof scheduler.runNow);
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Import failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
