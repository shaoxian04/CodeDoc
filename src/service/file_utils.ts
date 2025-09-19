import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility functions for file operations
 */

/**
 * Sanitize file path by removing any .git extensions that might have been appended
 * @param filePath The file path to sanitize
 * @returns The sanitized file path
 */
export function sanitizeFilePath(filePath: string): string {
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
export function isFileAccessible(filePath: string): boolean {
    try {
        // First sanitize the file path
        const sanitizedPath = sanitizeFilePath(filePath);
        return fs.existsSync(sanitizedPath) && fs.lstatSync(sanitizedPath).isFile();
    } catch (error) {
        console.error(`Error checking file accessibility for ${filePath}:`, error);
        return false;
    }
}

/**
 * Read a file with error handling and path sanitization
 * @param filePath The file path to read
 * @returns The file content or null if an error occurred
 */
export function readFileSafely(filePath: string): string | null {
    try {
        // First sanitize the file path
        const sanitizedPath = sanitizeFilePath(filePath);
        
        // Check if file exists
        if (!isFileAccessible(sanitizedPath)) {
            console.warn(`File not accessible: ${sanitizedPath}`);
            return null;
        }
        
        return fs.readFileSync(sanitizedPath, 'utf-8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}