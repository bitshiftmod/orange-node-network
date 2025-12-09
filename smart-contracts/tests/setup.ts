// Jest setup file for handling BigInt serialization
// BigInt values from algosdk and contracts need to be serializable for Jest

// Extend BigInt interface to include toJSON
interface BigInt {
  toJSON(): string;
}

// Add toJSON method to BigInt prototype for proper JSON serialization
BigInt.prototype.toJSON = function() {
  return this.toString();
};
