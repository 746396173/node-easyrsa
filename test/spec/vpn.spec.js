import fs from 'fs';
import path from 'path';
import expect from 'expect';
import Promise from 'bluebird';
import {pki} from 'node-forge';
import {map, groupBy} from 'lodash';

import EasyRSA from './../../src';
import {
  assignTo, loadCertificateFromPemFile, loadCertificationRequestFromPemFile, getCertificateSubject, getCertificateIssuer
} from './../helpers';

Promise.promisifyAll(fs);

const rootDir = path.resolve(__dirname, '..', '..');
const pkiDir = path.resolve(rootDir, '.tmp', 'vpn');
jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe.only('EasyRSA ~ vpn', () => {
  const res = {};
  const fixtures = {};
  const caStore = pki.createCaStore();
  const options = {
    pkiDir
  };
  beforeAll(() => Promise.all([
    Promise.props({
      ca: loadCertificateFromPemFile('fixtures/vpn/ca.crt'),
      chain: Promise.all([loadCertificateFromPemFile('fixtures/vpn/issued/server@foo.bar.com.crt')]),
      serverReq: loadCertificationRequestFromPemFile('fixtures/vpn/reqs/server@foo.bar.com.req'),
      serverCert: loadCertificateFromPemFile('fixtures/vpn/issued/server@foo.bar.com.crt'),
      clientReq: loadCertificationRequestFromPemFile('fixtures/vpn/reqs/baz@foo.bar.com.req'),
      clientCert: loadCertificateFromPemFile('fixtures/vpn/issued/baz@foo.bar.com.crt')
    }).then(assignTo(fixtures))
  ]));
  describe('#constructor()', () => {
    it('should properly merge options', () => {
      const easyrsa = new EasyRSA();
      expect(typeof easyrsa.config).toBe('object');
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
    beforeAll(() => Promise.all([
      easyrsa.buildCA({serialNumberBytes: 9})
        .tap(assignTo(res, 'ca'))
        .tap(({cert}) => {
          caStore.addCertificate(cert);
        })
    ]));
    it('should properly return a privateKey and a cert', () => {
      const {privateKey, cert} = res.ca;
      const privateKeyPem = pki.privateKeyToPem(privateKey);
      expect(typeof privateKeyPem).toBe('string');
      expect(privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\r\n.+/);
      const certPem = pki.certificateToPem(cert);
      expect(typeof certPem).toBe('string');
      expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
      expect(cert.serialNumber).toMatch(/[0-9a-f]{16}/);
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
      expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
      expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
    });
    it('should properly self-verify', () => {
      const {cert} = res.ca;
      return new Promise((resolve, reject) => {
        try {
          pki.verifyCertificateChain(caStore, [cert], (vfd, depth, chain) => {
            if (vfd === true) {
              resolve();
            } else {
              reject();
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    });
  });
  describe('server', () => {
    const commonName = 'server@foo.bar.com';
    describe('#genReq()', () => {
      const easyrsa = new EasyRSA(options);
      const attributes = {
        countryName: 'France'
      };
      beforeAll(() => Promise.all([
        easyrsa.genReq({commonName, attributes}).then(assignTo(res, 'req'))
      ]));
      it('should properly return a privateKey and a csr', () => {
        const {privateKey, csr} = res.req;
        const privateKeyPem = pki.privateKeyToPem(privateKey);
        expect(typeof privateKeyPem).toBe('string');
        expect(privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\r\n.+/);
        const csrPem = pki.certificationRequestToPem(csr);
        expect(typeof csrPem).toBe('string');
        expect(csrPem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\r\n.+/);
      });
      it('should have correct extensions', () => {
        const {csr} = res.req;
        const csrPem = pki.certificationRequestToPem(csr);
        const resultCsr = pki.certificationRequestFromPem(csrPem);
        const expectedCsr = fixtures.serverReq;
        expect(map(resultCsr.extensions, 'name').sort()).toEqual(map(expectedCsr.extensions, 'name').sort());
        expect(map(resultCsr.extensions, 'id').sort()).toEqual(map(expectedCsr.extensions, 'id').sort());
      });
      it('should have correct basicConstraints and keyUsage', () => {
        const {csr} = res.req;
        const csrPem = pki.certificationRequestToPem(csr);
        const resultCsr = pki.certificationRequestFromPem(csrPem);
        const expectedCsr = fixtures.serverReq;
        const extensions = groupBy(resultCsr.extensions, 'name');
        const expectedExtensions = groupBy(expectedCsr.extensions, 'name');
        expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
        expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
      });
      it('should support an existing privateKey', () => {
        const {privateKey: existingPrivateKey} = res.req;
        const existingPrivateKeyPem = pki.privateKeyToPem(existingPrivateKey);
        return easyrsa.genReq({commonName, attributes, privateKey: existingPrivateKeyPem})
          .then(({privateKey}) => {
            expect(pki.privateKeyToPem(privateKey)).toEqual(pki.privateKeyToPem(existingPrivateKey));
          });
      });
    });
    describe('#signReq()', () => {
      const easyrsa = new EasyRSA(options);
      const attributes = {};
      beforeAll(() => Promise.all([
        easyrsa.signReq({commonName, attributes, type: 'server', serialNumberBytes: 16}).then(assignTo(res, 'cert'))
      ]));
      it('should properly return a cert and a serial', () => {
        const {cert, serial} = res.cert;
        const certPem = pki.certificateToPem(cert);
        expect(typeof certPem).toBe('string');
        expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
        expect(typeof serial).toBe('string');
        expect(serial).toMatch(/[\da-f]/i);
        expect(cert.serialNumber).toMatch(/[0-9a-f]{16}/);
      });
      it('should have correct extensions', () => {
        const {cert} = res.cert;
        const certPem = pki.certificateToPem(cert);
        const resultCert = pki.certificateFromPem(certPem);
        const expectedCert = fixtures.serverCert;
        expect(getCertificateIssuer(resultCert)).toEqual(getCertificateSubject(res.ca.cert));
        expect(getCertificateIssuer(resultCert)).toEqual(getCertificateIssuer(expectedCert));
        expect(getCertificateSubject(resultCert)).toEqual(getCertificateSubject(expectedCert));
        expect(resultCert.serialNumber.length).toEqual(expectedCert.serialNumber.length);
        expect(map(resultCert.extensions, 'name').sort()).toEqual(map(expectedCert.extensions, 'name').sort());
        expect(map(resultCert.extensions, 'id').sort()).toEqual(map(expectedCert.extensions, 'id').sort());
      });
      it('should have correct basicConstraints and keyUsage', () => {
        const {cert} = res.cert;
        const certPem = pki.certificateToPem(cert);
        const resultCert = pki.certificateFromPem(certPem);
        const expectedCert = fixtures.serverCert;
        const extensions = groupBy(resultCert.extensions, 'name');
        const expectedExtensions = groupBy(expectedCert.extensions, 'name');
        expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
        expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
        expect(extensions.extKeyUsage).toEqual(expectedExtensions.extKeyUsage);
      });
    });
    describe('#createServer()', () => {
      const easyrsa = new EasyRSA(options);
      const attributes = {};
      beforeAll(() => Promise.all([
        easyrsa.createServer({commonName, attributes, serialNumberBytes: 16}).then(assignTo(res, 'cert'))
      ]));
      it('should properly return a cert and a serial', () => {
        const {cert, serial} = res.cert;
        const certPem = pki.certificateToPem(cert);
        expect(typeof certPem).toBe('string');
        expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
        expect(typeof serial).toBe('string');
        expect(serial).toMatch(/[\da-f]/i);
        expect(cert.serialNumber).toMatch(/[0-9a-f]{16}/);
      });
      it('should have correct extensions', () => {
        const {cert} = res.cert;
        const certPem = pki.certificateToPem(cert);
        const resultCert = pki.certificateFromPem(certPem);
        const expectedCert = fixtures.serverCert;
        expect(getCertificateIssuer(resultCert)).toEqual(getCertificateSubject(res.ca.cert));
        expect(getCertificateIssuer(resultCert)).toEqual(getCertificateIssuer(expectedCert));
        expect(getCertificateSubject(resultCert)).toEqual(getCertificateSubject(expectedCert));
        expect(resultCert.serialNumber.length).toEqual(expectedCert.serialNumber.length);
        expect(map(resultCert.extensions, 'name').sort()).toEqual(map(expectedCert.extensions, 'name').sort());
        expect(map(resultCert.extensions, 'id').sort()).toEqual(map(expectedCert.extensions, 'id').sort());
      });
      it('should have correct basicConstraints and keyUsage', () => {
        const {cert} = res.cert;
        const certPem = pki.certificateToPem(cert);
        const resultCert = pki.certificateFromPem(certPem);
        const expectedCert = fixtures.serverCert;
        const extensions = groupBy(resultCert.extensions, 'name');
        const expectedExtensions = groupBy(expectedCert.extensions, 'name');
        expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
        expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
        expect(extensions.extKeyUsage).toEqual(expectedExtensions.extKeyUsage);
      });
    });
  });
  describe('client', () => {
    const commonName = 'baz@foo.bar.com';
    describe('#genReq()', () => {
      const easyrsa = new EasyRSA(options);
      const attributes = {};
      beforeAll(() => Promise.all([
        easyrsa.genReq({commonName, attributes}).then(assignTo(res, 'req'))
      ]));
      it('should properly return a privateKey and a csr', () => {
        const {privateKey, csr} = res.req;
        const privateKeyPem = pki.privateKeyToPem(privateKey);
        expect(typeof privateKeyPem).toBe('string');
        expect(privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\r\n.+/);
        const csrPem = pki.certificationRequestToPem(csr);
        expect(typeof csrPem).toBe('string');
        expect(csrPem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\r\n.+/);
      });
      it('should have correct extensions', () => {
        const {csr} = res.req;
        const csrPem = pki.certificationRequestToPem(csr);
        const resultCsr = pki.certificationRequestFromPem(csrPem);
        const expectedCsr = fixtures.clientReq;
        expect(map(resultCsr.extensions, 'name').sort()).toEqual(map(expectedCsr.extensions, 'name').sort());
        expect(map(resultCsr.extensions, 'id').sort()).toEqual(map(expectedCsr.extensions, 'id').sort());
      });
      it('should have correct basicConstraints and keyUsage', () => {
        const {csr} = res.req;
        const csrPem = pki.certificationRequestToPem(csr);
        const resultCsr = pki.certificationRequestFromPem(csrPem);
        const expectedCsr = fixtures.clientReq;
        const extensions = groupBy(resultCsr.extensions, 'name');
        const expectedExtensions = groupBy(expectedCsr.extensions, 'name');
        expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
        expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
      });
      it('should support an existing privateKey', () => {
        const {privateKey: existingPrivateKey} = res.req;
        const existingPrivateKeyPem = pki.privateKeyToPem(existingPrivateKey);
        return easyrsa.genReq({commonName, attributes, privateKey: existingPrivateKeyPem})
          .then(({privateKey}) => {
            expect(pki.privateKeyToPem(privateKey)).toEqual(pki.privateKeyToPem(existingPrivateKey));
          });
      });
    });
    describe('#signReq()', () => {
      const easyrsa = new EasyRSA(options);
      const attributes = {};
      beforeAll(() => Promise.all([
        easyrsa.signReq({commonName, attributes, type: 'client'}).then(assignTo(res, 'cert'))
      ]));
      it('should properly return a cert and a serial', () => {
        const {cert, serial} = res.cert;
        const certPem = pki.certificateToPem(cert);
        expect(typeof certPem).toBe('string');
        expect(certPem).toMatch(/^-----BEGIN CERTIFICATE-----\r\n.+/);
        expect(typeof serial).toBe('string');
        expect(serial).toMatch(/[\da-f]/i);
        expect(cert.serialNumber).toMatch(/[0-9a-f]{16}/);
        expect(parseInt(cert.serialNumber, 16) > 0).toBeTruthy();
      });
      it('should have correct extensions', () => {
        const {cert} = res.cert;
        const certPem = pki.certificateToPem(cert);
        const resultCert = pki.certificateFromPem(certPem);
        const expectedCert = fixtures.clientCert;
        expect(getCertificateIssuer(resultCert)).toEqual(getCertificateSubject(res.ca.cert));
        expect(getCertificateIssuer(resultCert)).toEqual(getCertificateIssuer(expectedCert));
        expect(getCertificateSubject(resultCert)).toEqual(getCertificateSubject(expectedCert));
        expect(parseInt(resultCert.serialNumber, 16).length).toEqual(parseInt(expectedCert.serialNumber, 16).length);
        expect(map(resultCert.extensions, 'name').sort()).toEqual(map(expectedCert.extensions, 'name').sort());
        expect(map(resultCert.extensions, 'id').sort()).toEqual(map(expectedCert.extensions, 'id').sort());
      });
      it('should have correct basicConstraints and keyUsage', () => {
        const {cert} = res.cert;
        const certPem = pki.certificateToPem(cert);
        const resultCert = pki.certificateFromPem(certPem);
        const expectedCert = fixtures.clientCert;
        const extensions = groupBy(resultCert.extensions, 'name');
        const expectedExtensions = groupBy(expectedCert.extensions, 'name');
        expect(extensions.basicConstraints).toEqual(expectedExtensions.basicConstraints);
        expect(extensions.keyUsage).toEqual(expectedExtensions.keyUsage);
        expect(extensions.extKeyUsage).toEqual(expectedExtensions.extKeyUsage);
      });
      it('should properly verify', () => {
        const {cert} = res.cert;
        return new Promise((resolve, reject) => {
          try {
            pki.verifyCertificateChain(caStore, [cert], (vfd, depth, chain) => {
              if (vfd === true) {
                resolve();
              } else {
                reject();
              }
            });
          } catch (err) {
            reject(err);
          }
        });
      });
    });
  });
});
