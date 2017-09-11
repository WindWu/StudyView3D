define([
    './EditAction',
    './Utils',
    './MarkupCircle'
], function(EditAction, Utils, MarkupCircle) {
    'use strict';
    /**
     * @class
     * Implements an [EditAction]{@link Autodesk.Viewing.Extensions.Markups.Core.EditAction}
     * for creating a Circle [Markup]{@link Autodesk.Viewing.Extensions.Markups.Core.Markup}.
     * Included in documentation as an example of how to create
     * a specific EditAction that deals with Markup creation.
     * Developers are encourage to look into this class's source code and copy
     * as much code as they need. Find link to source code below.
     *
     * @tutorial feature_markup
     * @constructor
     * @memberof Autodesk.Viewing.Extensions.Markups.Core
     * @extends Autodesk.Viewing.Extensions.Markups.Core.EditAction
     *
     * @param editor
     * @param id
     * @param position
     * @param size
     * @param rotation
     * @param style
     */
    function CreateCircle(editor, id, position, size, rotation, style) {
        
                EditAction.call(this, editor, 'CREATE-CIRCLE', id);
        
                this.selectOnExecution = false;
                this.position = { x: position.x, y: position.y };
                this.size = { x: size.x, y: size.y };
                this.rotation = rotation;
                this.style = Utils.cloneStyle(style);
            }
        
            CreateCircle.prototype = Object.create(EditAction.prototype);
            CreateCircle.prototype.constructor = CreateCircle;
        
            var proto = CreateCircle.prototype;
        
            proto.redo = function () {
        
                var editor = this.editor;
                var circle = new MarkupCircle(this.targetId, editor);
        
                editor.addMarkup(circle);
        
                circle.setSize(this.position, this.size.x, this.size.y);
                circle.setRotation(this.rotation);
                circle.setStyle(this.style);
            };
        
            proto.undo = function () {
        
                var markup = this.editor.getMarkup(this.targetId);
                markup && this.editor.removeMarkup(markup);
            };

            return CreateCircle;
});