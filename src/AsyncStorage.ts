import * as localforage from "localforage";
import AsyncStorage from "@react-native-async-storage/async-storage";
(localforage as any).getAllKeys = localforage.keys;

export default AsyncStorage ?? localforage;
