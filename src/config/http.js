import axios from 'axios';

export const defaultHttpClient = axios.create({
  timeout: 10000
});
