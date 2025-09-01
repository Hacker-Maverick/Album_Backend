import bcrypt from 'bcrypt';

const saltRounds = 10;

// Function to hash a plain text password
export const hashPassword = async (plainPassword) => {
  return await bcrypt.hash(plainPassword, saltRounds);
};

// Function to compare plain text password with hashed one
export const comparePassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};
