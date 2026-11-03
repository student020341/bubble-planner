/**
 * @file Data model definitions and JSDoc types for project planning bubbles.
 */

/**
 * Supported scalar data types for properties.
 * @typedef {string} ScalarType
 */

/**
 * Key-value mapping of property name to scalar type.
 * @typedef {Record<string, ScalarType>} PropertyMap
 */

/**
 * A planning node (bubble).
 * @typedef {Object} BubbleNode
 * @property {number} id - Unique numeric identifier.
 * @property {number|null} parentId - Parent bubble id, or null if root level.
 * @property {string} label - Display name of the bubble.
 * @property {string} [description] - Optional details/notes.
 * @property {number} x - Virtual world X coordinate.
 * @property {number} y - Virtual world Y coordinate.
 * @property {PropertyMap} [properties] - Typed attributes on this node.
 */

/**
 * A directional action or connection between two nodes.
 * @typedef {Object} BubbleRelationship
 * @property {number} id - Unique numeric identifier.
 * @property {number} from - Origin node id.
 * @property {number} to - Target node id.
 * @property {string} label - Action name / label.
 * @property {string} [description] - Optional details/notes.
 * @property {PropertyMap} [properties] - Typed attributes on this action.
 */

/**
 * Complete serialized project document.
 * @typedef {Object} ProjectDocument
 * @property {number} lastNodeId - Last generated node id.
 * @property {number} lastRelId - Last generated relationship id.
 * @property {ScalarType[]} types - Registered scalar types (e.g. ['text', 'number']).
 * @property {BubbleNode[]} nodes - Flat list of all bubbles.
 * @property {BubbleRelationship[]} relationships - Flat list of all connections.
 */
