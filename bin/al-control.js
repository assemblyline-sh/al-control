#!/usr/bin/env node

import { hideBin } from 'yargs/helpers';
import { run } from '../src/cli/index.js';

run(hideBin(process.argv));
