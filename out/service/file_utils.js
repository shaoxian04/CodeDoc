"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeFilePath = sanitizeFilePath;
exports.isFileAccessible = isFileAccessible;
exports.readFileSafely = readFileSafely;
const fs = __importStar(require("fs"));
/**
 * Utility functions for file operations
 */
/**
 * Sanitize file path by removing any .git extensions that might have been appended
 * @param filePath The file path to sanitize
 * @returns The sanitized file path
 */
function sanitizeFilePath(filePath) {
    // Remove any .git extension that might have been appended
    if (filePath.endsWith('.java.git')) {
        return filePath.slice(0, -4); // Remove .git extension
    }
    return filePath;
}
/**
 * Check if a file exists and is accessible
 * @param filePath The file path to check
 * @returns True if the file exists and is accessible, false otherwise
 */
function isFileAccessible(filePath) {
    try {
        // First sanitize the file path
        const sanitizedPath = sanitizeFilePath(filePath);
        return fs.existsSync(sanitizedPath) && fs.lstatSync(sanitizedPath).isFile();
    }
    catch (error) {
        console.error(`Error checking file accessibility for ${filePath}:`, error);
        return false;
    }
}
/**
 * Read a file with error handling and path sanitization
 * @param filePath The file path to read
 * @returns The file content or null if an error occurred
 */
function readFileSafely(filePath) {
    try {
        // First sanitize the file path
        const sanitizedPath = sanitizeFilePath(filePath);
        // Check if file exists
        if (!isFileAccessible(sanitizedPath)) {
            console.warn(`File not accessible: ${sanitizedPath}`);
            return null;
        }
        return fs.readFileSync(sanitizedPath, 'utf-8');
    }
    catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}
//# sourceMappingURL=file_utils.js.map