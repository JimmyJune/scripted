/*******************************************************************************
 * @license
 * Copyright (c) 2012 VMware, Inc. All Rights Reserved.
 * THIS FILE IS PROVIDED UNDER THE TERMS OF THE ECLIPSE PUBLIC LICENSE
 * ("AGREEMENT"). ANY USE, REPRODUCTION OR DISTRIBUTION OF THIS FILE
 * CONSTITUTES RECIPIENTS ACCEPTANCE OF THE AGREEMENT.
 * You can obtain a current copy of the Eclipse Public License from
 * http://www.opensource.org/licenses/eclipse-1.0.php
 *
 * Contributors:
 *     Andrew Eisenberg - initial API and implementation
 ******************************************************************************/

// implements a zen coding plugin for scripted

/*jslint browser:true */
/*global define emmet prompt scripted */

define(function(require) {
	var TAB_POS = "${0}";

	var lib = require('./emmet-full');  // TODO consider using emmet-full.min

	var setKeyBinding = require('scripted/api/keybinder').setKeyBinding;
	var setAction = require('scripted/api/editor-extensions').setAction;

	var createProxy = function(editorAPI) {
			return emmet.exec(function(req, _) {
				var res = req('resources');
				var utils = req('utils');
				res.setVariable('indentation', editorAPI.getIndent());
				utils.setNewline('\n');
				return {
					/**
					 * Returns character indexes of selected text: object with <code>start</code>
					 * and <code>end</code> properties. If there's no selection, should return
					 * object with <code>start</code> and <code>end</code> properties referring
					 * to current caret position
					 * @return {Object}
					 * @example
					 * var selection = editorAPI.getSelectionRange();
					 * alert(selection.start + ', ' + selection.end);
					 */
					getSelectionRange: function() {
						var sel = editorAPI.getSelection();
						return {
							start: sel.start,
							end: sel.end
						};
					},

					/**
					 * Creates selection from <code>start</code> to <code>end</code> character
					 * indexes. If <code>end</code> is ommited, this method should place caret
					 * and <code>start</code> index
					 * @param Number start
					 * @param Number end
					 * @example
					 * editorAPI.createSelection(10, 40);
					 *
					 * //move caret to 15th character
					 * editorAPI.createSelection(15);
					 */
					createSelection: function(start, end) {
						editorAPI.setSelection(start, end);
					},

					/**
					 * Returns current line's start and end indexes as object with <code>start</code>
					 * and <code>end</code> properties
					 * @return {Object}
					 * @example
					 * var range = editorAPI.getCurrentLineRange();
					 * alert(range.start + ', ' + range.end);
					 */
					getCurrentLineRange: function() {
						var selStart = this.getCaretPos();
						return editorAPI.getCurrentLineRange(selStart);
					},

					/**
					 * Returns current caret position
					 * @return {Number|null}
					 */
					getCaretPos: function() {
						var sel = this.getSelectionRange();
						return Math.min(sel.start, sel.end);
					},
					/**
					 * Set new caret position
					 * @param {Number} pos Caret position
					 */
					setCaretPos: function(pos) {
						this.createSelection(pos, pos);
					},

					/**
					 * Returns content of current line
					 * @return {String}
					 */
					getCurrentLine: function() {
						var range = this.getCurrentLineRange();
						return this.getContent().substring(range.start, range.end);
					},
					/**
					 * Replace editor's content or it's part (from <code>start</code> to
					 * <code>end</code> index). If <code>value</code> contains
					 * <code>caret_placeholder</code>, the editor will put caret into
					 * this position. If you skip <code>start</code> and <code>end</code>
					 * arguments, the whole target's content will be replaced with
					 * <code>value</code>.
					 *
					 * If you pass <code>start</code> argument only,
					 * the <code>value</code> will be placed at <code>start</code> string
					 * index of current content.
					 *
					 * If you pass <code>start</code> and <code>end</code> arguments,
					 * the corresponding substring of current target's content will be
					 * replaced with <code>value</code>.
					 * @param {String} value Content you want to paste
					 * @param {Number} [start] Start index of editor's content
					 * @param {Number} [end] End index of editor's content
					 * @param {Boolean} [no_indent] Do not auto indent <code>value</code>
					 */
					replaceContent: function(value, start, end, no_indent) {
						if (!start && !end) {
							start = 0;
							end = editorAPI.getText().length;
						}
						if (!end) {
							end = start;
						}

						if (!no_indent) {
							var leading = editorAPI.getLeadingWhitespace(start);
							var regex = new RegExp('\n', "g");
							value = value.replace(regex, "\n" + leading);
						}

						value = utils.unescapeText(value);
						editorAPI.setText(value, start, end);

						var pos = value.indexOf(TAB_POS);
						if (pos !== -1) {
							var linkedMode = editorAPI.createLinkedMode();
							var linkedModeModel = {
								groups: []
							};
							while (pos !== -1) {
								linkedModeModel.groups.push({
									positions: [{
										offset: pos + start,
										length: TAB_POS.length
									}]
								});
								pos = value.indexOf(TAB_POS, pos + TAB_POS.length);
							}
							linkedMode.enterLinkedMode(linkedModeModel);
						}
					},

					/**
					 * Returns editor's content
					 * @return {String}
					 */
					getContent: function() {
						return editorAPI.getText();
					},

					getSyntax: function() {
						return editorAPI.getContentType();
					},

					getProfileName: function() {
						return this.getSyntax();
					},

					// TODO uhhhh...we can do better
					prompt: function(title) {
						return prompt(title);
					},

					getSelection: function() {
						var sel = this.getSelectionRange();
						if (sel) {
							return editorAPI.getText(sel.start, sel.end);
						}
						return '';
					},

					/**
					 * Returns current editor's file path
					 * @return {String}
					 * @since 0.65
					 */
					getFilePath: function() {
						return editorAPI.getFilePath();
					}
				};
			});


		};

	function runEmmetAction(name, editor) {
		try {
			var proxy = createProxy(editor);
			// Whoooooaaah!!!!! require thinks this is a require call for actions module
			var r = emmet.require;
			return r('actions').run(name, [proxy]);
		} catch (e) {
			if (e.constructor.name === 'Error') {
				console.warn(e.message);
				console.warn(e.stack);
			} else {
				// emmet likes to throw strings
				console.warn(e);
			}
			return false;
		}
	}

	function registerEmmetAction(name, key) {
		var zenName = "Zen " + name;
		var zenID = 'zenCodingPlugin.' + name;
		setKeyBinding("Ctrl+Shift+" + key, zenID);
		setAction(zenID, {
			name: zenName,
			handler: function(editorAPI) {
				runEmmetAction(name, editorAPI);
				return false;
			}
		});
	}

	var i = 0;
	registerEmmetAction("expand_abbreviation", ++i);
	registerEmmetAction("match_pair_inward", ++i);
	registerEmmetAction("match_pair_outward", ++i);
	registerEmmetAction("matching_pair", ++i);
	registerEmmetAction("merge_lines", ++i);
	registerEmmetAction("remove_tag", ++i);
	registerEmmetAction("select_next_item", ++i);
	registerEmmetAction("select_previous_item", ++i);
	registerEmmetAction("split_join_tag", ++i);
});