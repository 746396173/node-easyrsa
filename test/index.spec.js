
import fs from 'fs';
import del from 'del';
import path from 'path';
import expect from 'expect';
import EasyRSA from './..';
import {pki} from 'node-forge';
import {map} from 'lodash';

// require('debug-utils');

const options = {
  pkiDir: path.resolve(__dirname, '.tmp')
};

describe('EasyRSA', () => {
  before(() => Promise.all([
    del([options.pkiDir])
  ]));
  describe('#constructor()', () => {
    it('should properly merge options', () => {
      const easyrsa = new EasyRSA();
      expect(easyrsa.config).toBeA('object');
      expect(easyrsa.config.pkiDir).toEqual(path.resolve(__dirname, '..', 'pki'));
    });
  });
  describe('#initPKI()', () => {
    it('should properly return a privateKey and a cert', () => {
      const easyrsa = new EasyRSA(options);
      return easyrsa.initPKI({force: true}).then(() => {
        return fs.statAsync(easyrsa.config.pkiDir).call('isDirectory').then((isDirectory) => {
          expect(isDirectory).toBeTrue;
        });
      });
    });
  });
  describe('#buildCA()', () => {
    it('should properly return a privateKey and a cert', () => {
      const easyrsa = new EasyRSA(options);
      easyrsa.buildCA().then(({privateKey, cert}) => {
        const privateKeyPem = pki.privateKeyToPem(privateKey);
        expect(privateKeyPem).toBeA('string');
        expect(privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\r\n.+/);
        const certPem = pki.certificateToPem(cert);
        expect(certPem).toBeA('string');
        expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
        expect(map(cert.extensions, 'id')).toEqual(['2.5.29.14', '2.5.29.35', '2.5.29.19', '2.5.29.15']);
      });
    });
  });
  describe('#genReq()', () => {
    it('should properly return a privateKey and a csr', () => {
      const easyrsa = new EasyRSA(options);
      easyrsa.genReq('EntityName').then(({privateKey, csr}) => {
        const privateKeyPem = pki.privateKeyToPem(privateKey);
        expect(privateKeyPem).toBeA('string');
        expect(privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\r\n.+/);
        const csrPem = pki.certificationRequestToPem(csr);
        expect(csrPem).toBeA('string');
        expect(csrPem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\r\n.+/);
        expect(map(csr.extensions, 'id')).toEqual([]);
      });
    });
  });
  describe('#signReq()', () => {
    it('should properly return a privateKey and a csr', () => {
      const easyrsa = new EasyRSA(options);
      easyrsa.signReq('client', 'EntityName').then(({cert, serial}) => {
        const certPem = pki.certificateToPem(cert);
        expect(certPem).toBeA('string');
        expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
        expect(serial).toBeA('string');
        expect(serial).toMatch(/[\da-f]/i);
        expect(map(cert.extensions, 'id')).toEqual(['2.5.29.19', '2.5.29.14', '2.5.29.35', '2.5.29.15', '2.5.29.37']);
      });
    });
  });
});
