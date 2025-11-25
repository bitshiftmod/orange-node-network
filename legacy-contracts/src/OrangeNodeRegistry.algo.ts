import { Contract } from '@algorandfoundation/tealscript';

type Registration = {
  friendlyName: string;
  fqdn: string;
  port: uint8;
};

// eslint-disable-next-line no-unused-vars
class OrangeNodeRegistry extends Contract {
  registrations = BoxMap<Address, Registration>();
  // myRegistration = GlobalStateKey<Registration>();

  @allow.bareCreate()
  createApplication(): void {}

  @allow.bareCall('UpdateApplication')
  updateApplication(): void {
    assert(this.txn.sender === this.app.creator);
  }

  registerNode(friendlyName: string, fqdn: string, port: uint8): void {
    const registration: Registration = { friendlyName: friendlyName, fqdn: fqdn, port: port };

    this.registrations(this.txn.sender).value = registration;
  }
}
