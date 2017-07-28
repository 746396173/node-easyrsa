import 'debug-utils';
import fs from 'fs';
import path from 'path';
import expect from 'expect';
import Promise from 'bluebird';
import {pki} from 'node-forge';
import {map, groupBy} from 'lodash';

import EasyRSA from './../../src';
import {assignTo, loadCertificateFromPemFile, getCertificateSubject, getCertificateIssuer} from './../helpers';

Promise.promisifyAll(fs);

const rootDir = path.resolve(__dirname, '..', '..');
const pkiDir = path.resolve(rootDir, '.tmp', 'ssl');
jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe('EasyRSA ~ ssl', () => {
  const res = {};
  const fixtures = {};
  const options = {
    template: 'ssl',
    pkiDir
  };
  beforeAll(() => Promise.all([
    Promise.props({
      ca: loadCertificateFromPemFile('fixtures/ssl/DigiCert High Assurance EV Root CA.pem'),
      chain: Promise.all([loadCertificateFromPemFile('fixtures/ssl/DigiCert SHA2 Extended Validation Server CA.pem')]),
      cert: loadCertificateFromPemFile('fixtures/ssl/www.digitalocean.com.pem')
    }).then(assignTo(fixtures))
  ]));
  describe('#constructor()', () => {
    it('should properly merge options', () => {
      const easyrsa = new EasyRSA();
      expect(easyrsa.config).toBeA('object');
      expect(easyrsa.config.pkiDir).toEqual(path.resolve(rootDir, 'pki'));
    });
  });
  describe('#initPKI()', () => {
    it('should properly initialize a new pki', () => {
      const easyrsa = new EasyRSA(options);
      return easyrsa.initPKI({force: true}).then(() =>
        fs.statAsync(easyrsa.config.pkiDir).call('isDirectory').then((isDirectory) => {
          expect(isDirectory).toBe(true);
        }));
    });
  });
  describe('#buildCA()', () => {
    const easyrsa = new EasyRSA(options);
    const commonName = 'DigiCert High Assurance EV Root CA';
    const attributes = {
      countryName: 'US',
      organizationName: 'DigiCert Inc',
      organizationalUnitName: 'www.digicert.com'
    };
    beforeAll(() => Promise.all([
      easyrsa.buildCA({commonName, attributes}).then(assignTo(res, 'ca'))
    ]));
    it('should properly return a privateKey and a cert', () => {
      const {privateKey, cert} = res.ca;
      const privateKeyPem = pki.privateKeyToPem(privateKey);
      expect(privateKeyPem).toBeA('string');
      expect(privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\r\n.+/);
      const certPem = pki.certificateToPem(cert);
      expect(certPem).toBeA('string');
      expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
      expect(cert.serialNumber).toMatch(/[0-9a-f]{16}/);
      expect(getCertificateSubject(cert)).toEqual({commonName, ...attributes});
    });
    it('should have correct extensions', () => {
      const {cert} = res.ca;
      const certPem = pki.certificateToPem(cert);
      const resultCert = pki.certificateFromPem(certPem);
      const expectedCert = fixtures.ca;
      expect(getCertificateSubject(resultCert)).toEqual(getCertificateSubject(expectedCert));
      expect(resultCert.serialNumber.length).toEqual(expectedCert.serialNumber.length);
      expect(map(resultCert.extensions, 'name').sort()).toEqual(map(expectedCert.extensions, 'name').sort());
      expect(map(resultCert.extensions, 'id').sort()).toEqual(map(expectedCert.extensions, 'id').sort());
    });
    it('should have correct basicConstraints and keyUsage', () => {
      const {cert} = res.ca;
      const certPem = pki.certificateToPem(cert);
      const resultCert = pki.certificateFromPem(certPem);
      const expectedCert = fixtures.ca;
      const extensions = groupBy(resultCert.extensions, 'name');
      const expectedExtensions = groupBy(expectedCert.extensions, 'name');
      // d(getCertificateShortSubject(expectedCert));
      expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
      expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
    });
  });
  describe('#genReq()', () => {
    const easyrsa = new EasyRSA(options);
    const commonName = 'www.digitalocean.com';
    const attributes = {
      countryName: 'US',
      organizationName: 'DigitalOcean, LLC',
      localityName: 'New York',
      stateOrProvinceName: 'New York'
    };
    beforeAll(() => Promise.all([
      easyrsa.genReq({commonName, attributes}).then(assignTo(res, 'req'))
    ]));
    it('should properly return a privateKey and a csr', () => {
      const {privateKey, csr} = res.req;
      const privateKeyPem = pki.privateKeyToPem(privateKey);
      expect(privateKeyPem).toBeA('string');
      expect(privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\r\n.+/);
      const csrPem = pki.certificationRequestToPem(csr);
      expect(csrPem).toBeA('string');
      expect(csrPem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\r\n.+/);
    });
    // it('should have correct extensions', () => {
    //   const {csr} = res;
    //   const csrPem = pki.certificationRequestToPem(csr);
    //   const resultCsr = pki.certificationRequestFromPem(csrPem);
    //   const expectedCsr = fixtures.req;
    //   expect(map(resultCsr.extensions, 'name')).toEqual(map(expectedCsr.extensions, 'name'));
    //   expect(map(resultCsr.extensions, 'id')).toEqual(map(expectedCsr.extensions, 'id'));
    // });
    // it('should have correct basicConstraints and keyUsage', () => {
    //   const {csr} = res;
    //   const csrPem = pki.certificationRequestToPem(csr);
    //   const resultCsr = pki.certificationRequestFromPem(csrPem);
    //   const expectedCsr = fixtures.req;
    //   const extensions = groupBy(resultCsr.extensions, 'name');
    //   const expectedExtensions = groupBy(expectedCsr.extensions, 'name');
    //   expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
    //   expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
    // });
  });
  describe('#signReq()', () => {
    const easyrsa = new EasyRSA(options);
    const commonName = 'www.digitalocean.com';
    const attributes = {
      countryName: 'US',
      organizationName: 'DigitalOcean, LLC',
      localityName: 'New York',
      stateOrProvinceName: 'New York'
    };
    beforeAll(() => Promise.all([
      easyrsa.signReq({commonName, attributes, type: 'client'}).then(assignTo(res, 'cert'))
    ]));
    it('should properly return a cert and a serial', () => {
      const {cert, serial} = res.cert;
      const certPem = pki.certificateToPem(cert);
      expect(certPem).toBeA('string');
      expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
      expect(serial).toBeA('string');
      expect(serial).toMatch(/[\da-f]/i);
      expect(cert.serialNumber).toMatch(/[0-9a-f]{16}/);
      expect(getCertificateSubject(cert)).toEqual({commonName, ...attributes});
    });
    it('should have correct extensions', () => {
      const {cert} = res.cert;
      const certPem = pki.certificateToPem(cert);
      const resultCert = pki.certificateFromPem(certPem);
      const expectedCert = fixtures.cert;
      expect(getCertificateIssuer(resultCert)).toEqual(getCertificateSubject(res.ca.cert));
      // expect(getCertificateIssuer(resultCert)).toEqual(getCertificateIssuer(expectedCert)); // @TODO chain
      expect(getCertificateSubject(resultCert)).toEqual(getCertificateSubject(expectedCert));
      expect(resultCert.serialNumber.length).toEqual(expectedCert.serialNumber.length);
      // expect(map(resultCert.extensions, 'name').sort()).toEqual(map(expectedCert.extensions, 'name').sort());
      // expect(map(resultCert.extensions, 'id').sort()).toEqual(map(expectedCert.extensions, 'id').sort());
    });
    it('should have correct basicConstraints and keyUsage', () => {
      const {cert} = res.cert;
      const certPem = pki.certificateToPem(cert);
      const resultCert = pki.certificateFromPem(certPem);
      const expectedCert = fixtures.cert;
      // d(getCertificateShortSubject(expectedCert));
      const extensions = groupBy(resultCert.extensions, 'name');
      const expectedExtensions = groupBy(expectedCert.extensions, 'name');
      expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
      expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
      // expect(extensions.extKeyUsage).toEqual(expectedExtensions.extKeyUsage);
    });
  });
});
