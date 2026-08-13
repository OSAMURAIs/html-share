#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { App, Tags } from 'aws-cdk-lib';
import { loadConfig, resolveFromConfig } from '../../src/config.js';
import { HtmlShareStack } from '../lib/html-share-stack.js';

const config = loadConfig();
const app = new App();

new HtmlShareStack(app, 'HtmlShareStack', {
  ownerEmail: config.ownerEmail,
  consoleDomain: config.aws.consoleDomain,
  contentDomain: config.aws.contentDomain,
  certificateArn: config.aws.certificateArn,
  cognitoDomainPrefix: config.aws.cognitoDomainPrefix,
  privateKeyParameterName: config.aws.privateKeyParameterName,
  publicKeyPem: readFileSync(resolveFromConfig(config, config.aws.publicKeyPath), 'utf8'),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.aws.region,
  },
  description: 'HTML Share: self-hosted dashboard for Claude Code results',
});

Tags.of(app).add('Project', 'html-share');
