define([
    './DockingPanel',
    '../Core/Logger',
    './Tree',
    './TreeDelegate'
], function(DockingPanel, Logger, Tree, TreeDelegate) {
    'use strict';
    /**
     * ModelStructurePanel
     * Sets the model structure panel for displaying the loaded model.
     * @class
     * @augments Autodesk.Viewing.UI.DockingPanel
     *
     * @param {HTMLElement} parentContainer - The container for this panel.
     * @param {string} id - The id for this panel.
     * @param {string} title - The initial title for this panel.
     * @param {Object} [options] - An optional dictionary of options.
     * @param {boolean} [options.startCollapsed=true] - When true, collapses all of the nodes under the root.
     * @constructor
     */
    var ModelStructurePanel = function (parentContainer, id, title, options) {
        DockingPanel.call(this, parentContainer, id, title, options);
        this.container.classList.add('modelStructurePanel');

        options = options || {};
        if (!options.heightAdjustment)
            options.heightAdjustment = 40;
        if (!options.marginTop)
            options.marginTop = 0;
        options.left = true;

        this.createScrollContainer(options);

        this.options = options;
        this.instanceTree = null;
        this.tree = null;
        this.selectedNodes = [];

        this.uiCreated = false;

        var that = this;
        this.addVisibilityListener(function (show) {
            if (show) {
                if (!that.uiCreated) {
                    that.createUI();
                }

                that.resizeToContent();
            }
        });


    };

    ModelStructurePanel.prototype = Object.create(DockingPanel.prototype);
    ModelStructurePanel.prototype.constructor = ModelStructurePanel;

    /**
     * Sets the model for this panel to display.
     *
     * @param {InstanceTree} instanceTree - The object tree returned by Autodesk.Viewing.Model.getObjectTree( function(instanceTree) );
     * @param {string=} [modelTitle] - An optional title to display for this model.
     */
    ModelStructurePanel.prototype.setModel = function (instanceTree, modelTitle) {
        this.instanceTree = instanceTree;
        this.modelTitle = modelTitle;

        if (this.isVisible())
            this.createUI();
        else
            this.uiCreated = false;
    };

    /**
     * Used for delayed initialization of the HTML DOM tree
     * @private
     */
    ModelStructurePanel.prototype.createUI = function () {
        var that = this;
        var instanceTree = that.instanceTree;

        if (!instanceTree)
            return;

        var createDelegate = function () {
            var delegate = new TreeDelegate();

            delegate.getTreeNodeId = function (node) {
                if (typeof node == "object") {
                    Logger.warn("Object used instead of dbId. Fix it.");
                    return node.dbId;
                } else
                    return node;
            };

            delegate.getTreeNodeLabel = function (node) {
                var dbId = this.getTreeNodeId(node);

                var res = that.instanceTree.getNodeName(dbId);

                return res || ('Object ' + dbId);
            };

            delegate.getTreeNodeClass = function (node) {
                return that.getNodeClass(node);
            };

            delegate.isTreeNodeGroup = function (node) {
                return that.isGroupNode(node);
            };

            delegate.shouldCreateTreeNode = function (node) {
                return that.shouldInclude(node);
            };

            delegate.onTreeNodeClick = function (tree, node, event) {
                that.onClick(node, event);
            };

            delegate.onTreeNodeRightClick = function (tree, node, event) {
                that.onRightClick(node, event);
            };

            delegate.onTreeNodeDoubleClick = function (tree, node, event) {
                that.onDoubleClick(node, event);
            };

            delegate.onTreeNodeIconClick = function (tree, node, event) {
                that.onIconClick(node, event);
            };

            delegate.forEachChild = function (node, callback) {

                var dbId = this.getTreeNodeId(node);

                that.instanceTree.enumNodeChildren(dbId, callback);
            };

            delegate.onTreeNodeHover = function (tree, node, event) {
                that.onHover(node, event);
            };

            return delegate;
        };

        that.selectedNodes = [];

        var title = that.modelTitle;

        if (!title) {
            if (that.options && that.options.defaultTitle) {
                title = that.options.defaultTitle;
            }
        }

        var options = {};
        if (!title) {
            title = "Browser";  // localized by DockingPanel.prototype.setTitle
            options.localizeTitle = true;
        }
        that.setTitle(title, options);

        // Remove the previous tree from the scroll container and any listeners on the title bar.
        //
        if (that.tree) {
            while (that.scrollContainer.hasChildNodes()) {
                that.scrollContainer.removeChild(that.scrollContainer.lastChild);
            }
            that.title.removeEventListener("click", that.onTitleClick);
            that.title.removeEventListener("dblclick", that.onTitleDoubleClick);
        }

        var rootId = this.rootId = instanceTree.getRootId();
        var rootName = instanceTree.getNodeName(rootId);
        var childName;
        var childId = 0;
        var childCount = 0;
        instanceTree.enumNodeChildren(rootId, function (child) {
            if (!childCount) {
                childName = instanceTree.getNodeName(child);
                childId = child;
            }
            childCount++;
        });

        var delegate = createDelegate();
        this.myDelegate = delegate;

        //Detect Fusion models which have a root inside a root (which was probably an arms race
        //against us putting the root in the title bar)
        var skipRoot = (childCount === 1 && rootName === childName);

        var treeOptions = {
            excludeRoot: skipRoot,
            localize: true
        };
        that.tree = new Tree(delegate, rootId, that.scrollContainer, treeOptions);

        if (!that.options || !that.options.hasOwnProperty('startCollapsed') || that.options.startCollapsed) {
            that.tree.setAllCollapsed(true);

            that.tree.setCollapsed(rootId, false);
            if (skipRoot)
                that.tree.setCollapsed(childId, false);
        }

        this.uiCreated = true;
    };

    /**
     * Override this method to specify the label for a node.
     * By default, this is the node's name, or 'Object ' + object id if the name
     * is blank.
     *
     * @param {Object} node - A node in an Autodesk.Viewing.Model
     * @returns {string} Label of the tree node
     */
    ModelStructurePanel.prototype.getNodeLabel = function (node) {
        return this.myDelegate.getNodeLabel(node);
    };

    /**
     * Override this to specify the CSS classes of a node. This way, in CSS, the designer
     * can specify custom styling per type.
     * By default, an empty string is returned.
     *
     * @param {Object} node - A node in an Autodesk.Viewing.Model
     * @returns {string} CSS classes for the node
     */
    ModelStructurePanel.prototype.getNodeClass = function (node) {
        return '';
    };

    /**
     * Override this method to specify whether or not a node is a group node.
     * By default, a node is considered a group if it has a 'children' property containing
     * an array with at least one element.
     *
     * @param {Object} node - A node in an Autodesk.Viewing.Model
     * @returns {boolean} true if this node is a group node, false otherwise
     */
    ModelStructurePanel.prototype.isGroupNode = function (node) {
        var dbId = this.myDelegate.getTreeNodeId(node);
        return this.instanceTree.getChildCount(dbId);
    };

    /**
     * Override this method to specify if a tree node should be created for this node.
     * By default, every node will be displayed.
     *
     * @param {Object} node - A node in an {@link Autodesk.Viewing.Model}
     * @returns {boolean} true if a node should be created, false otherwise
     */
    ModelStructurePanel.prototype.shouldInclude = function (node) {
        return true;
    };

    /**
     * Override this method to do something when the user clicks on a tree node
     * @param {Object} node - A node in an {@link Autodesk.Viewing.Model}
     * @param {Event} event
     */
    ModelStructurePanel.prototype.onClick = function (node, event) {
        this.setSelection([node]);
    };

    /**
     * Override this to do something when the user double-clicks on a tree node
     *
     * @param {Object} node - A node in an {@link Autodesk.Viewing.Model}
     * @param {Event} event
     */
    ModelStructurePanel.prototype.onDoubleClick = function (node, event) {
    };

    /**
     * Override this to do something when the user clicks on a tree node's icon.
     * By default, groups will be expanded/collapsed.
     *
     * @param {Object} node - A node in an {@link Autodesk.Viewing.Model}
     * @param {Event} event
     */
    ModelStructurePanel.prototype.onIconClick = function (node, event) {
        this.setGroupCollapsed(node, !this.isGroupCollapsed(node));
    };

    /**
     * Collapse/expand a group node.
     *
     * @param {Object} node - A node to collapse/expand in the tree.
     * @param {Boolean} collapsed - True to collapse the group, false to expand it.
     */
    ModelStructurePanel.prototype.setGroupCollapsed = function (node, collapsed) {
        var delegate = this.tree.delegate();
        if (delegate.isTreeNodeGroup(node)) {
            this.tree.setCollapsed(node, collapsed);

            this.resizeToContent();
        }
    };

    /**
     * Returns true if the group is collapsed.
     *
     * @param {Object} node - The node in the tree.
     * @returns {Boolean} - True if the group is collapsed, false otherwise.
     */
    ModelStructurePanel.prototype.isGroupCollapsed = function (node) {
        var delegate = this.tree.delegate();
        if (delegate.isTreeNodeGroup(node)) {
            return this.tree.isCollapsed(node);
        }
        return false
    };

    /**
     * Override this to do something when the user right-clicks on a tree node
     * 
     * @param {Object} node - A node in an Autodesk.Viewing.Model
     * @param {Event} event
     */
    ModelStructurePanel.prototype.onRightClick = function (node, event) {
    };

    /**
     * Override this method to be notified when the user clicks on the title.
     * @override
     * @param {Event} event
     */
    ModelStructurePanel.prototype.onTitleClick = function (event) {
    };

    /**
     * Override this method to be notified when the user double-clicks on the title.
     * @override
     * @param {Event} event
     */
    ModelStructurePanel.prototype.onTitleDoubleClick = function (event) {
    };

    /**
     * Override this to do something when the user hovers on a tree node
     *
     * @param {Object} node - A node in an {@link Autodesk.Viewing.Model}
     * @param {Event} event
    */
    ModelStructurePanel.prototype.onHover = function (node, event) {
    };

    /**
     * Displays the given nodes as selected in this panel.
     *
     * @param {Array} nodes - An array of Autodesk.Viewing.Model nodes to display as selected
     */
    ModelStructurePanel.prototype.setSelection = function (nodes) {
        // Bail if no model structure.
        //
        if (!this.tree) {
            return;
        }

        var i, parent;

        // Un-mark the ancestors.
        //
        for (i = 0; i < this.selectedNodes.length; ++i) {
            parent = this.instanceTree.getNodeParentId(this.selectedNodes[i]);
            while (parent) {
                this.tree.removeClass(parent, 'ancestor-selected');
                parent = this.instanceTree.getNodeParentId(parent);
            }
        }

        // Mark the ancestors of the newly selected nodes.
        //
        var selectedNodesHierarchy = [];
        for (i = 0; i < nodes.length; ++i) {
            selectedNodesHierarchy.push(nodes[i]);
            parent = this.instanceTree.getNodeParentId(nodes[i]);
            while (parent) {
                this.tree.addClass(parent, 'ancestor-selected');
                parent = this.instanceTree.getNodeParentId(parent);
            }
        }

        // Mark the newly selected nodes.
        //
        this.selectedNodes = nodes;
        this.tree.setSelection(selectedNodesHierarchy);
    };

    /**
     * Returns the width and height to be used when resizing the panel to the content.
     *
     * @returns {{height: number, width: number}}
     */
    ModelStructurePanel.prototype.getContentSize = function () {
        var tree = this.tree;
        if (tree) {
            var treeContainer = tree.getRootContainer();
            if (treeContainer) {
                return { height: treeContainer.clientHeight + this.options.heightAdjustment + 35, width: treeContainer.clientWidth };
            }
        }
        return { height: 0, width: 0 };
    };

    /**
     * Given a node's id, adds the given CSS class to this node.
     * 
     * @param {string} id - The id of a node in an Autodesk.Viewing.Model
     * @param {string} className - The CSS class to add
     * @returns {boolean} - true if the class was added, false otherwise
     */
    ModelStructurePanel.prototype.addClass = function (id, className) {
        return (this.tree !== null) && this.tree.addClass(id, className);
    };

    /**
     * Given a node's id, removes the given CSS class from this node.
     *
     * @param {string} id - The id of a node in an Autodesk.Viewing.Model
     * @param {string} className - The CSS class to remove
     * @returns {boolean} - true if the class was removed, false otherwise
     */
    ModelStructurePanel.prototype.removeClass = function (id, className) {
        return (this.tree !== null) && this.tree.removeClass(id, className);
    };


    return ModelStructurePanel;
});